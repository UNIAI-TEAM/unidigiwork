// QUẢN LÝ LỊCH HỌP CẤP TỔ CHỨC — xem toàn bộ lịch họp, gán nhân sự và bộ phận,
// nhập lịch họp từ Excel. Ghi dữ liệu qua RPC sẵn có (RLS + outbox) khi có thể;
// riêng trường "bộ phận" ghi sau khi đã xác thực quyền quản trị tổ chức.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

const fail = (code: string, message: string) => new ApiError({ code: code as never, message });

async function resolveTenant(context: any, workspaceId: string) {
  const { data, error } = await context.supabase
    .from("workspaces")
    .select("id, tenant_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error || !data) throw fail("WORKSPACE_NOT_FOUND", "Không tìm thấy không gian làm việc.");
  return data.tenant_id as string;
}

async function assertTenantAdmin(context: any, tenantId: string) {
  const { data: member } = await context.supabase
    .from("tenant_members")
    .select("role, status")
    .eq("tenant_id", tenantId)
    .eq("user_id", context.userId)
    .maybeSingle();
  const row = (member ?? {}) as { role?: string; status?: string };
  if (row.status !== "active" || !["tenant_owner", "tenant_admin"].includes(row.role ?? "")) {
    throw fail("FORBIDDEN", "Chỉ quản trị tổ chức mới được quản lý lịch họp.");
  }
}

export type AdminMeeting = {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  location: string | null;
  agenda: string | null;
  status: string | null;
  department: string | null;
  projectId: string | null;
  projectName: string | null;
  participants: { userId: string; name: string; rsvp: string | null }[];
};

/** Toàn bộ lịch họp của tổ chức (theo không gian làm việc đang chọn). */
export const listTenantMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        from: z.string().max(40).nullable().optional(),
        to: z.string().max(40).nullable().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<AdminMeeting[]> => {
    const tenantId = await resolveTenant(context, data.workspaceId);
    let q = context.supabase
      .from("meetings")
      .select(
        "id, title, start_at, end_at, location, agenda, status, department, project_id, meeting_participants(user_id, rsvp)",
      )
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("start_at", { ascending: false })
      .limit(data.limit);
    if (data.from) q = q.gte("start_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("start_at", new Date(data.to).toISOString());
    const { data: rows, error } = await q;
    if (error) throw fail("MEETING_NOT_FOUND", error.message);

    const list = (rows ?? []) as any[];
    const projectIds = Array.from(
      new Set(list.map((m) => m.project_id).filter((v: unknown): v is string => Boolean(v))),
    );
    const projectName = new Map<string, string>();
    if (projectIds.length) {
      const { data: projects } = await context.supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds);
      for (const p of (projects ?? []) as { id: string; name: string }[]) {
        projectName.set(p.id, p.name);
      }
    }

    const userIds = Array.from(
      new Set(
        list.flatMap((m) => (m.meeting_participants ?? []).map((p: any) => p.user_id as string)),
      ),
    ).slice(0, 300);
    const userName = new Map<string, string>();
    if (userIds.length) {
      const { data: users } = await context.supabase
        .from("users")
        .select("id, display_name, primary_email")
        .in("id", userIds);
      for (const u of (users ?? []) as {
        id: string;
        display_name: string | null;
        primary_email: string | null;
      }[]) {
        userName.set(u.id, u.display_name ?? u.primary_email ?? "Thành viên");
      }
    }

    return list.map((m) => ({
      id: m.id as string,
      title: m.title as string,
      startAt: m.start_at as string,
      endAt: (m.end_at ?? null) as string | null,
      location: (m.location ?? null) as string | null,
      agenda: (m.agenda ?? null) as string | null,
      status: (m.status ?? null) as string | null,
      department: (m.department ?? null) as string | null,
      projectId: (m.project_id ?? null) as string | null,
      projectName: m.project_id ? (projectName.get(m.project_id) ?? null) : null,
      participants: ((m.meeting_participants ?? []) as any[]).map((p) => ({
        userId: p.user_id as string,
        name: userName.get(p.user_id) ?? "Thành viên",
        rsvp: (p.rsvp ?? null) as string | null,
      })),
    }));
  });

/** Gán bộ phận phụ trách cho một cuộc họp (dùng cho KPI theo nhóm). */
export const setMeetingDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        meetingId: z.string().uuid(),
        department: z.string().trim().max(120).nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenant(context, data.workspaceId);
    await assertTenantAdmin(context, tenantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin
      .from("meetings" as never)
      .update({
        department: data.department?.trim() || null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.meetingId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);
    if (res.error) throw fail("MEETING_NOT_FOUND", res.error.message);
    return { ok: true as const };
  });

/** Danh sách thành viên có thể mời họp trong tổ chức. */
export const listMeetingCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenant(context, data.workspaceId);
    const { data: members } = await context.supabase
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(300);
    const ids = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id);
    if (!ids.length) return [] as { id: string; name: string; email: string | null }[];
    const { data: users } = await context.supabase
      .from("users")
      .select("id, display_name, primary_email")
      .in("id", ids);
    return ((users ?? []) as any[]).map((u) => ({
      id: u.id as string,
      name: (u.display_name ?? u.primary_email ?? "Thành viên") as string,
      email: (u.primary_email ?? null) as string | null,
    }));
  });

const meetingRowSchema = z.object({
  title: z.string().trim().min(1).max(300),
  startAt: z.string().trim().min(4).max(40),
  endAt: z.string().trim().max(40).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  agenda: z.string().trim().max(2000).nullable().optional(),
  department: z.string().trim().max(120).nullable().optional(),
  participants: z.string().trim().max(1000).nullable().optional(),
});

/** Nhập lịch họp cấp tổ chức từ Excel/CSV: gán bộ phận và người tham dự theo email. */
export const importTenantMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        rows: z.array(meetingRowSchema).min(1).max(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenant(context, data.workspaceId);
    await assertTenantAdmin(context, tenantId);

    const { data: members } = await context.supabase
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(300);
    const memberIds = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id);
    const emailToId = new Map<string, string>();
    if (memberIds.length) {
      const { data: users } = await context.supabase
        .from("users")
        .select("id, primary_email")
        .in("id", memberIds);
      for (const u of (users ?? []) as { id: string; primary_email: string | null }[]) {
        if (u.primary_email) emailToId.set(u.primary_email.toLowerCase(), u.id);
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let created = 0;
    const failed: string[] = [];

    for (const row of data.rows) {
      const start = new Date(row.startAt);
      if (Number.isNaN(start.getTime())) {
        failed.push(row.title);
        continue;
      }
      const end = row.endAt ? new Date(row.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
      if (Number.isNaN(end.getTime()) || end <= start) {
        failed.push(row.title);
        continue;
      }
      const ins = await supabaseAdmin
        .from("meetings" as never)
        .insert({
          tenant_id: tenantId,
          workspace_id: data.workspaceId,
          title: row.title,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          location: row.location?.trim() || null,
          agenda: row.agenda?.trim() || null,
          department: row.department?.trim() || null,
          status: "scheduled",
          created_by: context.userId,
        } as never)
        .select("id")
        .maybeSingle();
      if (ins.error || !ins.data) {
        failed.push(row.title);
        continue;
      }
      created += 1;
      const meetingId = (ins.data as unknown as { id: string }).id;

      const emails = (row.participants ?? "")
        .split(/[,;]/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const participantIds = Array.from(
        new Set(emails.map((e) => emailToId.get(e)).filter((v): v is string => Boolean(v))),
      );
      if (participantIds.length) {
        await supabaseAdmin.from("meeting_participants" as never).insert(
          participantIds.map((userId) => ({
            meeting_id: meetingId,
            user_id: userId,
            role: "attendee",
            rsvp: "pending",
          })) as never,
        );
      }
    }

    if (!created) throw fail("MEETING_NOT_FOUND", "Không nhập được cuộc họp nào từ tệp.");
    return { ok: true as const, created, failed: failed.slice(0, 20) };
  });
