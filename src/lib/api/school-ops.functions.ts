import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActivePack } from "./industry-pack.server";
import { draftSchoolNews, generateBrief, loadOverview } from "./school-ops.server";

export type SchoolBrief = {
  id: string;
  department: string | null;
  trigger: "manual" | "scheduled";
  status: "ok" | "no_data" | "error";
  content: string;
  created_at: string;
};

export type SchoolRole = "bgh" | "lead" | "teacher";

async function schoolContext(supabase: never, userId: string) {
  const { tenantId, pack } = await resolveActivePack(supabase, userId);
  if (!tenantId || pack !== "school") return null;
  const db = supabase as unknown as { from: (t: string) => any };
  const { data: m } = await db.from("tenant_members").select("role").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle();
  const { data: p } = await db.from("tenant_member_profiles").select("department").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle();
  const r = (m?.role ?? "member") as string;
  const role: SchoolRole = r === "tenant_owner" || r === "tenant_admin" ? "bgh" : r === "manager" ? "lead" : "teacher";
  const dept = typeof p?.department === "string" && p.department.trim() ? (p.department.trim() as string) : null;
  return { tenantId, role, dept, tenantRole: r };
}

export const getSchoolOps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ department: z.string().max(80).nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx)
      return { enabled: false as const, isLeader: false, role: "teacher" as SchoolRole, myDept: null as string | null, depts: [], briefs: [] as SchoolBrief[] };
    const dept = ctx.role === "bgh" ? data.department : (ctx.dept ?? null);
    const [depts, briefs] = await Promise.all([
      loadOverview(context.supabase, ctx.tenantId),
      dept === null && ctx.role !== "bgh"
        ? Promise.resolve({ data: [] })
        : context.supabase.rpc("list_school_briefs_v2", { _tenant_id: ctx.tenantId, _department: dept as string, _limit: 10 }),
    ]);
    return {
      enabled: true as const,
      isLeader: ctx.role === "bgh",
      role: ctx.role,
      myDept: ctx.dept,
      depts,
      briefs: (briefs.data ?? []) as SchoolBrief[],
    };
  });

export const createSchoolBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ department: z.string().max(80).nullable(), idempotencyKey: z.string().min(8).max(100) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) throw new Error("PACK_DISABLED");
    const b = await generateBrief(context.supabase, ctx.tenantId, data.department);
    const { data: id, error } = await context.supabase.rpc("save_school_brief_v2", {
      _tenant_id: ctx.tenantId,
      _department: data.department as string,
      _content: b.content,
      _facts: b.facts,
      _trigger: "manual",
      _status: b.status,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message.includes("FORBIDDEN") ? "FORBIDDEN" : "SAVE_FAILED");
    return { id: id as string, status: b.status };
  });

export type SchoolStaff = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  department: string | null;
  title: string | null;
};

export type SchoolInvite = { id: string; email: string; role: string; department: string | null; status: string; expires_at: string };

/** Danh sách nhân sự (BGH thấy toàn trường; tổ trưởng/giáo viên thấy tổ mình). */
export const getSchoolStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) return { enabled: false as const, role: "teacher" as SchoolRole, isOwner: false, staff: [] as SchoolStaff[], invites: [] as SchoolInvite[] };
    const { data: staff, error } = await context.supabase.rpc("school_staff", { _tenant_id: ctx.tenantId });
    if (error) throw new Error("STAFF_FAILED");
    let invites: SchoolInvite[] = [];
    if (ctx.role === "bgh") {
      const { data: inv } = await context.supabase.rpc("school_pending_invites", { _tenant_id: ctx.tenantId });
      invites = (inv ?? []) as SchoolInvite[];
    }
    return { enabled: true as const, role: ctx.role, isOwner: ctx.tenantRole === "tenant_owner", staff: (staff ?? []) as SchoolStaff[], invites };
  });

const staffRole = z.enum(["tenant_admin", "manager", "member"]);
const deptName = z.string().trim().max(80).nullable();

export const updateSchoolStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), role: staffRole.nullable(), department: deptName, correlationId: z.string().max(100).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) throw new Error("PACK_DISABLED");
    const { error } = await context.supabase.rpc("set_school_staff", {
      _tenant_id: ctx.tenantId,
      _user_id: data.userId,
      _role: data.role as string,
      _department: data.department as string,
      _correlation_id: data.correlationId,
    });
    if (error) throw new Error(stableCode(error.message));
    return { ok: true };
  });

function stableCode(m: string) {
  const codes = ["PERMISSION_DENIED", "TENANT_LAST_OWNER_PROTECTED", "TENANT_ROLE_CHANGE_FORBIDDEN", "TENANT_MEMBERSHIP_NOT_FOUND", "VALIDATION_FAILED", "TENANT_INVITATION", "FORBIDDEN", "MEETING_NOT_FOUND", "MEETING_NOT_EDITABLE", "RANGE_TOO_LARGE"];
  return codes.find((c) => m.toUpperCase().includes(c)) ?? "FAILED";
}

async function sha256(token: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mời một hoặc nhiều người (tối đa 200) — trả về liên kết mời (token chỉ trả một lần). */
export const inviteSchoolStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rows: z.array(z.object({ email: z.string().trim().toLowerCase().email(), role: staffRole, department: deptName })).min(1).max(200),
        correlationId: z.string().max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) throw new Error("PACK_DISABLED");
    if (ctx.role !== "bgh") throw new Error("PERMISSION_DENIED");
    const expires = new Date(Date.now() + 14 * 864e5).toISOString();
    const out: Array<{ email: string; token?: string; error?: string }> = [];
    for (const r of data.rows) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { error } = await context.supabase.rpc("school_invite", {
        _tenant_id: ctx.tenantId,
        _email: r.email,
        _role: r.role,
        _department: r.department as string,
        _token_hash: await sha256(token),
        _expires_at: expires,
        _correlation_id: data.correlationId,
      });
      out.push(error ? { email: r.email, error: stableCode(error.message) } : { email: r.email, token });
    }
    return out;
  });

/** Quản trị nội dung: tạo nháp bài tin trường học (chưa lưu, admin duyệt rồi mới đăng). */
export const draftSchoolNewsArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("FORBIDDEN");
    const { tenantId, pack } = await resolveActivePack(context.supabase as never, context.userId);
    if (!tenantId || pack !== "school") throw new Error("PACK_DISABLED");
    try {
      return await draftSchoolNews(context.supabase, tenantId);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      throw new Error(["NO_BRIEF", "NO_AI_BACKEND"].includes(m) ? m : "AI_ERROR");
    }
  });

export type AgendaItem = {
  kind: "meeting" | "task" | "brief";
  id: string;
  title: string;
  at: string;
  end_at: string | null;
  status: string;
};

/** Thời gian biểu: lịch họp, hạn công việc, bản tin trong khoảng ngày (tối đa 62 ngày). */
export const getSchoolAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ department: z.string().max(80).nullable(), from: z.string().datetime(), to: z.string().datetime() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { tenantId, pack } = await resolveActivePack(context.supabase as never, context.userId);
    if (!tenantId || pack !== "school") return [] as AgendaItem[];
    const { data: rows, error } = await context.supabase.rpc("school_agenda_v2", {
      _tenant_id: tenantId,
      _department: data.department as string,
      _from: data.from,
      _to: data.to,
    });
    if (error) { console.error("school_agenda", error.message); throw new Error("AGENDA_FAILED"); }
    return (rows ?? []) as AgendaItem[];
  });

export interface SchoolMeeting {
  id: string; title: string; start_at: string; end_at: string; status: string;
  location: string | null; agenda: string | null; department: string | null; row_version: number; can_manage: boolean;
}

export const listSchoolMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ department: z.string().max(80).nullable(), from: z.string().datetime(), to: z.string().datetime() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) return { enabled: false as const, role: "teacher" as SchoolRole, myDept: null as string | null, meetings: [] as SchoolMeeting[] };
    const dept = ctx.role === "bgh" ? data.department : ctx.dept;
    if (!dept && ctx.role !== "bgh") return { enabled: true as const, role: ctx.role, myDept: ctx.dept, meetings: [] as SchoolMeeting[] };
    const { data: rows, error } = await context.supabase.rpc("school_meetings", {
      _tenant_id: ctx.tenantId, _department: dept as string, _from: data.from, _to: data.to,
    });
    if (error) throw new Error(stableCode(error.message));
    return { enabled: true as const, role: ctx.role, myDept: ctx.dept, meetings: (rows ?? []) as SchoolMeeting[] };
  });

export const saveSchoolMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      meetingId: z.string().uuid().nullable(),
      title: z.string().trim().min(1).max(500),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      location: z.string().max(500).nullable(),
      agenda: z.string().max(10000).nullable(),
      department: z.string().trim().max(80).nullable(),
      idempotencyKey: z.string().min(8).max(200),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) throw new Error("PACK_DISABLED");
    const { data: id, error } = await context.supabase.rpc("school_save_meeting", {
      _tenant_id: ctx.tenantId, _meeting_id: data.meetingId as string, _title: data.title,
      _start_at: data.startAt, _end_at: data.endAt, _location: (data.location ?? null) as string,
      _agenda: (data.agenda ?? null) as string, _department: (data.department || null) as string,
      _idempotency_key: data.idempotencyKey, _correlation_id: data.idempotencyKey,
    });
    if (error) { console.error("school_save_meeting", error.message); throw new Error(stableCode(error.message)); }
    return { id: id as string };
  });

export const cancelSchoolMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ meetingId: z.string().uuid(), reason: z.string().max(1000).nullable(), idempotencyKey: z.string().min(8).max(200) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) throw new Error("PACK_DISABLED");
    const { error } = await context.supabase.rpc("school_cancel_meeting", {
      _tenant_id: ctx.tenantId, _meeting_id: data.meetingId, _reason: (data.reason ?? null) as string,
      _idempotency_key: data.idempotencyKey, _correlation_id: data.idempotencyKey,
    });
    if (error) throw new Error(stableCode(error.message));
    return { ok: true as const };
  });
