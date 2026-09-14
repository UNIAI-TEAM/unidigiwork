// LỊCH HỌP TUẦN TỰ ĐỘNG — mỗi tuần hệ thống tự tạo buổi họp giao ban tuần trên lịch họp,
// tự ghi thời gian, địa điểm và người tham dự (toàn bộ thành viên đang hoạt động của tổ chức).
/* eslint-disable @typescript-eslint/no-explicit-any */

const ADMIN_ROLES = ["tenant_owner", "tenant_admin"];
const MIN_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000; // tối đa 1 buổi / tuần
const MEETING_TZ = "Asia/Ho_Chi_Minh";
const MEETING_TITLE = "Họp giao ban tuần";
const DEFAULT_LOCATION = "Phòng họp trực tuyến UniWork";
const DEFAULT_DOW = 1; // Thứ Hai
const DEFAULT_HOUR_VN = 9;
const MEETING_MINUTES = 60;
const MAX_PARTICIPANTS = 200;

export type WeeklyMeetingResult = {
  tenants: number;
  created: number;
  skipped: number;
  exists: number;
  errors: string[];
};

/** Giờ Việt Nam hiện tại (0-23). */
function currentVnHour(now = new Date()): number {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCHours();
}

/** Thứ trong tuần theo giờ Việt Nam (0 = Chủ nhật … 6 = Thứ Bảy). */
function currentVnDow(now = new Date()): number {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCDay();
}

/** Mốc bắt đầu buổi họp tuần của hôm nay theo giờ Việt Nam (trả về UTC). */
function todayMeetingStart(hourVn: number, now = new Date()): Date {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(), hourVn - 7, 0, 0, 0),
  );
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
    : "không hạn";

/** Tóm tắt tuần vừa qua để đưa vào nội dung cuộc họp. */
async function buildAgenda(admin: any, tenantId: string): Promise<string> {
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const nowIso = new Date().toISOString();

  const [{ data: completed }, { data: open }] = await Promise.all([
    admin
      .from("tasks")
      .select("id")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .eq("status", "done")
      .gte("completed_at", from)
      .limit(500),
    admin
      .from("tasks")
      .select("title, due_at, status, progress_pct")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .in("status", ["todo", "in_progress", "blocked"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200),
  ]);

  const openRows = (open ?? []) as {
    title: string;
    due_at: string | null;
    status: string;
    progress_pct: number | null;
  }[];
  const overdue = openRows.filter((t) => t.due_at && t.due_at < nowIso);
  const blocked = openRows.filter((t) => t.status === "blocked");

  return [
    "Nội dung họp giao ban tuần (hệ thống tự tổng hợp):",
    `1. Kết quả tuần qua: ${(completed ?? []).length} việc hoàn thành.`,
    `2. Việc đang mở: ${openRows.length}, trong đó ${overdue.length} quá hạn, ${blocked.length} vướng mắc.`,
    "3. Việc quá hạn cần xử lý:",
    ...(overdue.length
      ? overdue
          .slice(0, 10)
          .map(
            (t, i) =>
              `   ${i + 1}. ${t.title} — hạn ${fmtDate(t.due_at)}, tiến độ ${t.progress_pct ?? 0}%`,
          )
      : ["   (không có)"]),
    "4. Kế hoạch tuần tới và phân công.",
  ]
    .join("\n")
    .slice(0, 4000);
}

/**
 * Tạo buổi họp tuần cho các tổ chức đến lịch (đúng thứ và giờ đã chọn theo giờ Việt Nam).
 * Idempotent: mỗi tổ chức tối đa một buổi trong 6 ngày.
 */
export async function runWeeklyMeeting(
  admin: any,
  limit = 20,
  opts: { force?: boolean } = {},
): Promise<WeeklyMeetingResult> {
  const result: WeeklyMeetingResult = {
    tenants: 0,
    created: 0,
    skipped: 0,
    exists: 0,
    errors: [],
  };

  const vnHour = currentVnHour();
  const vnDow = currentVnDow();

  const { data: settings } = await admin
    .from("ceo_kpi_settings")
    .select(
      "tenant_id, weekly_meeting_dow, weekly_meeting_hour_vn, weekly_meeting_location, weekly_meeting_at",
    )
    .limit(limit);

  const rows = (settings ?? []) as {
    tenant_id: string;
    weekly_meeting_dow: number | null;
    weekly_meeting_hour_vn: number | null;
    weekly_meeting_location: string | null;
    weekly_meeting_at: string | null;
  }[];

  for (const row of rows) {
    result.tenants += 1;
    const dow = row.weekly_meeting_dow ?? DEFAULT_DOW;
    const hourVn = row.weekly_meeting_hour_vn ?? DEFAULT_HOUR_VN;
    if (!opts.force && (dow !== vnDow || hourVn !== vnHour)) {
      result.skipped += 1;
      continue;
    }
    if (
      row.weekly_meeting_at &&
      Date.now() - new Date(row.weekly_meeting_at).getTime() < MIN_INTERVAL_MS
    ) {
      result.skipped += 1;
      continue;
    }

    try {
      const start = todayMeetingStart(hourVn);
      const end = new Date(start.getTime() + MEETING_MINUTES * 60 * 1000);

      // Không tạo trùng: đã có buổi họp tuần trong khoảng ±12 giờ quanh mốc này.
      const { data: existing } = await admin
        .from("meetings")
        .select("id")
        .eq("tenant_id", row.tenant_id)
        .eq("title", MEETING_TITLE)
        .is("deleted_at", null)
        .gte("start_at", new Date(start.getTime() - 12 * 3_600_000).toISOString())
        .lt("start_at", new Date(start.getTime() + 12 * 3_600_000).toISOString())
        .limit(1)
        .maybeSingle();
      if (existing) {
        result.exists += 1;
        continue;
      }

      const { data: member } = await admin
        .from("tenant_members")
        .select("user_id")
        .eq("tenant_id", row.tenant_id)
        .eq("status", "active")
        .in("role", ADMIN_ROLES)
        .limit(1)
        .maybeSingle();
      const hostId = (member as { user_id?: string } | null)?.user_id;
      if (!hostId) {
        result.skipped += 1;
        continue;
      }

      const { data: ws } = await admin
        .from("workspaces")
        .select("id")
        .eq("tenant_id", row.tenant_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const workspaceId = (ws as { id?: string } | null)?.id;
      if (!workspaceId) {
        result.skipped += 1;
        continue;
      }

      const agenda = await buildAgenda(admin, row.tenant_id);
      const { data: created, error: insErr } = await admin
        .from("meetings")
        .insert({
          tenant_id: row.tenant_id,
          workspace_id: workspaceId,
          title: MEETING_TITLE,
          agenda,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          timezone: MEETING_TZ,
          location: row.weekly_meeting_location || DEFAULT_LOCATION,
          status: "scheduled",
          created_by: hostId,
        })
        .select("id")
        .maybeSingle();
      if (insErr) throw new Error(insErr.message);
      const meetingId = (created as { id?: string } | null)?.id;
      if (!meetingId) throw new Error("MEETING_INSERT_FAILED");

      const { data: members } = await admin
        .from("tenant_members")
        .select("user_id")
        .eq("tenant_id", row.tenant_id)
        .eq("status", "active")
        .limit(MAX_PARTICIPANTS);
      const ids = new Set<string>([hostId]);
      for (const m of (members ?? []) as { user_id: string }[]) ids.add(m.user_id);

      const { error: partErr } = await admin.from("meeting_participants").insert(
        [...ids].map((userId) => ({
          meeting_id: meetingId,
          tenant_id: row.tenant_id,
          user_id: userId,
          role: userId === hostId ? "host" : "participant",
          rsvp: "pending",
        })),
      );
      if (partErr) throw new Error(partErr.message);

      await admin
        .from("ceo_kpi_settings")
        .update({ weekly_meeting_at: new Date().toISOString() })
        .eq("tenant_id", row.tenant_id);

      result.created += 1;
    } catch (e) {
      result.errors.push(`${row.tenant_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
