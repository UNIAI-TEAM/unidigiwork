// People — CRUD hồ sơ nhân sự theo tenant (tenant_members + users + tenant_member_profiles). RLS applies.
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";

export type PersonDTO = {
  id: string;
  name: string;
  seed: string;
  role: string;
  memberStatus: string;
  email: string;
  title: string;
  department: string;
  team: string;
  location: string;
  phone: string;
  empId: string;
  joinDate: string;
  reportsTo: string;
  skills: string[];
  teams: string[];
  about: string;
  isSelf: boolean;
};

export type PeopleListResult = {
  tenantId: string | null;
  canManage: boolean;
  people: PersonDTO[];
  departments: string[];
  roles: string[];
  locations: string[];
};

type Ctx = { supabase: any; userId: string };

/** Resolve active tenant + role of the caller (cookie hint, re-validated by RLS). */
async function resolveTenant(ctx: Ctx): Promise<{ tenantId: string; role: string } | null> {
  const { data, error } = await ctx.supabase
    .from("tenant_members")
    .select("tenant_id, role, status")
    .eq("user_id", ctx.userId)
    .eq("status", "active");
  if (error) mapPgError(error, "TENANT_ACCESS_DENIED");
  const rows = (data ?? []) as Array<{ tenant_id: string; role: string }>;
  if (rows.length === 0) return null;
  const hint = getCookie(ACTIVE_TENANT_COOKIE);
  const matched = hint ? rows.find((r) => r.tenant_id === hint) : undefined;
  const chosen = matched ?? rows[0];
  return { tenantId: chosen.tenant_id, role: chosen.role };
}

const MANAGER_ROLES = ["tenant_owner", "tenant_admin"];

function toPerson(
  m: { user_id: string; role: string; status: string },
  u: { display_name: string | null; primary_email: string | null } | undefined,
  p: Record<string, unknown> | undefined,
  selfId: string,
): PersonDTO {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  return {
    id: m.user_id,
    name: u?.display_name ?? u?.primary_email ?? "Thành viên",
    seed: m.user_id,
    role: m.role,
    memberStatus: m.status,
    email: u?.primary_email ?? "",
    title: str(p?.["title"]),
    department: str(p?.["department"]),
    team: str(p?.["team"]),
    location: str(p?.["location"]),
    phone: str(p?.["phone"]),
    empId: str(p?.["emp_id"]),
    joinDate: str(p?.["join_date"]),
    reportsTo: str(p?.["reports_to"]),
    skills: arr(p?.["skills"]),
    teams: arr(p?.["teams"]),
    about: str(p?.["about"]),
    isSelf: m.user_id === selfId,
  };
}

async function loadPeople(ctx: Ctx, tenantId: string): Promise<PersonDTO[]> {
  const { data: members, error } = await ctx.supabase
    .from("tenant_members")
    .select("user_id, role, status")
    .eq("tenant_id", tenantId)
    .neq("status", "removed");
  if (error) mapPgError(error);
  const rows = (members ?? []) as Array<{ user_id: string; role: string; status: string }>;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.user_id);
  const [usersRes, profRes] = await Promise.all([
    ctx.supabase.from("users").select("id, display_name, primary_email").in("id", ids),
    ctx.supabase.from("tenant_member_profiles").select("*").eq("tenant_id", tenantId).in("user_id", ids),
  ]);
  if (usersRes.error) mapPgError(usersRes.error);
  if (profRes.error) mapPgError(profRes.error);
  const uMap = new Map<string, { display_name: string | null; primary_email: string | null }>();
  for (const u of usersRes.data ?? []) uMap.set(u.id, u);
  const pMap = new Map<string, Record<string, unknown>>();
  for (const p of profRes.data ?? []) pMap.set(p.user_id as string, p);
  return rows
    .map((m) => toPerson(m, uMap.get(m.user_id), pMap.get(m.user_id), ctx.userId))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export const listPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PeopleListResult> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant)
      return { tenantId: null, canManage: false, people: [], departments: [], roles: [], locations: [] };
    const people = await loadPeople(ctx, tenant.tenantId);
    const uniq = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort();
    return {
      tenantId: tenant.tenantId,
      canManage: MANAGER_ROLES.includes(tenant.role),
      people,
      departments: uniq(people.map((p) => p.department)),
      roles: uniq(people.map((p) => p.role)),
      locations: uniq(people.map((p) => p.location)),
    };
  });

export const getPerson = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ person: PersonDTO; canManage: boolean }> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
    const people = await loadPeople(ctx, tenant.tenantId);
    const person = people.find((p) => p.id === data.userId);
    if (!person) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "RESOURCE_NOT_FOUND" });
    return { person, canManage: MANAGER_ROLES.includes(tenant.role) || person.isSelf };
  });

const ProfileInput = z.object({
  userId: z.string().uuid(),
  title: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  team: z.string().max(120).optional(),
  location: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  empId: z.string().max(40).optional(),
  joinDate: z.string().max(20).optional(),
  reportsTo: z.string().max(120).optional(),
  skills: z.array(z.string().max(60)).max(50).optional(),
  teams: z.array(z.string().max(60)).max(50).optional(),
  about: z.string().max(2000).optional(),
  displayName: z.string().max(120).optional(),
  role: z.string().max(40).optional(),
});

/** Tạo/cập nhật hồ sơ nhân sự (phòng ban, kỹ năng…) — bản thân hoặc quản trị tenant. */
export const upsertPersonProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ProfileInput.parse(i))
  .handler(async ({ data, context }): Promise<{ person: PersonDTO }> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
    const isManager = MANAGER_ROLES.includes(tenant.role);
    if (!isManager && data.userId !== ctx.userId)
      throw new ApiError({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED" });

    const payload: Record<string, unknown> = {
      tenant_id: tenant.tenantId,
      user_id: data.userId,
      title: data.title ?? null,
      department: data.department ?? null,
      team: data.team ?? null,
      location: data.location ?? null,
      phone: data.phone ?? null,
      emp_id: data.empId ?? null,
      join_date: data.joinDate && data.joinDate.length > 0 ? data.joinDate : null,
      reports_to: data.reportsTo ?? null,
      skills: data.skills ?? [],
      teams: data.teams ?? [],
      about: data.about ?? null,
    };
    const { error } = await ctx.supabase
      .from("tenant_member_profiles")
      .upsert(payload, { onConflict: "tenant_id,user_id" });
    if (error) mapPgError(error);

    if (data.displayName && data.displayName.trim().length > 0) {
      const { error: uErr } = await ctx.supabase
        .from("users")
        .update({ display_name: data.displayName.trim() })
        .eq("id", data.userId);
      if (uErr && !isManager && data.userId !== ctx.userId) mapPgError(uErr);
    }

    if (data.role && isManager) {
      const { error: rErr } = await ctx.supabase.rpc("change_tenant_member_role", {
        _tenant_id: tenant.tenantId,
        _user_id: data.userId,
        _new_role: data.role,
        _correlation_id: null,
      });
      if (rErr) mapPgError(rErr, "PERMISSION_DENIED");
    }

    const people = await loadPeople(ctx, tenant.tenantId);
    const person = people.find((p) => p.id === data.userId);
    if (!person) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "RESOURCE_NOT_FOUND" });
    return { person };
  });

/** Gỡ nhân sự khỏi tổ chức (soft: status = removed) — chỉ quản trị tenant. */
export const removePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
    if (!MANAGER_ROLES.includes(tenant.role))
      throw new ApiError({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED" });
    if (data.userId === ctx.userId)
      throw new ApiError({ code: "VALIDATION_FAILED", message: "Không thể tự gỡ chính mình" });
    const { error } = await ctx.supabase.rpc("change_tenant_member_status", {
      _tenant_id: tenant.tenantId,
      _user_id: data.userId,
      _new_status: "removed",
      _correlation_id: null,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    await ctx.supabase
      .from("tenant_member_profiles")
      .delete()
      .eq("tenant_id", tenant.tenantId)
      .eq("user_id", data.userId);
    return { ok: true };
  });
/** Một dòng nhân sự nhập từ Excel/CSV: khớp thành viên theo email. */
const PeopleImportRow = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().max(120).nullable().optional(),
  department: z.string().trim().max(120).nullable().optional(),
  title: z.string().trim().max(120).nullable().optional(),
  team: z.string().trim().max(120).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  empId: z.string().trim().max(40).nullable().optional(),
});

/**
 * Nhập bộ phận / chức danh cho thành viên đã có trong tổ chức từ tệp Excel.
 * Không tạo tài khoản mới: email không khớp thành viên sẽ được báo lại để mời riêng.
 */
export const importPeopleProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ rows: z.array(PeopleImportRow).min(1).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant)
      throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
    if (!MANAGER_ROLES.includes(tenant.role))
      throw new ApiError({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED" });

    const people = await loadPeople(ctx, tenant.tenantId);
    const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]));

    let updated = 0;
    const notFound: string[] = [];
    for (const row of data.rows) {
      const person = byEmail.get(row.email.toLowerCase());
      if (!person) {
        notFound.push(row.email);
        continue;
      }
      const payload = {
        tenant_id: tenant.tenantId,
        user_id: person.id,
        title: row.title ?? person.title ?? null,
        department: row.department ?? person.department ?? null,
        team: row.team ?? person.team ?? null,
        location: row.location ?? person.location ?? null,
        phone: row.phone ?? person.phone ?? null,
        emp_id: row.empId ?? person.empId ?? null,
        skills: person.skills ?? [],
        teams: person.teams ?? [],
      };
      const { error } = await ctx.supabase
        .from("tenant_member_profiles")
        .upsert(payload, { onConflict: "tenant_id,user_id" });
      if (error) continue;
      if (row.displayName && row.displayName.trim()) {
        await ctx.supabase
          .from("users")
          .update({ display_name: row.displayName.trim() })
          .eq("id", person.id);
      }
      updated += 1;
    }

    return { ok: true as const, updated, notFound: notFound.slice(0, 20) };
  });
