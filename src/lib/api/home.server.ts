// HOME V2 — server-only aggregation cho "My Work + Work Inbox".
// Chỉ đọc dữ liệu cá nhân của actor hiện tại (RLS áp dụng như user).
// Không copy dữ liệu sang bảng mới: đây là presentation aggregation.
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type HomeTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  row_version: number;
  overdue_days: number | null;
};

export type HomeUpcoming = {
  id: string;
  kind: "meeting" | "task";
  title: string;
  start_at: string;
  end_at: string | null;
  participants: number;
  joinable: boolean;
  href: string;
};

export type WorkInboxItem = {
  id: string;
  type: "TASK" | "MENTION" | "APPROVAL" | "CHAT" | "EMAIL" | "MEETING" | "NOTIFICATION";
  title: string;
  summary: string | null;
  source: string;
  timestamp: string;
  priority: "urgent" | "high" | "normal" | "low";
  href: string;
  read: boolean;
  actor: string | null;
};

export type HomeSummary = {
  counts: {
    dueToday: number;
    overdue: number;
    mentions: number;
    approvals: number;
    meetings: number;
    unreadChat: number;
    unreadEmail: number;
    attention: number;
  };
  myWork: HomeTask[];
  upcoming: HomeUpcoming[];
  inbox: WorkInboxItem[];
  brief: string[];
  partial: string[];
};

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function dayBounds(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const endToday = new Date(start.getTime() + 86400_000);
  const endTomorrow = new Date(start.getTime() + 2 * 86400_000);
  return { start, endToday, endTomorrow };
}

export async function loadHomeSummary(supabase: Db, userId: string): Promise<HomeSummary> {
  const now = new Date();
  const { start, endToday, endTomorrow } = dayBounds(now);
  const partial: string[] = [];

  // 1 & 2 — id công việc / cuộc họp của tôi (metadata, không lấy body).
  const [assignRes, partRes] = await Promise.all([
    supabase.from("task_assignees").select("task_id").eq("user_id", userId).limit(300),
    supabase.from("meeting_participants").select("meeting_id").eq("user_id", userId).limit(200),
  ]);
  const taskIds = ((assignRes.data ?? []) as Row[]).map((r) => r.task_id as string);
  const meetingIds = ((partRes.data ?? []) as Row[]).map((r) => r.meeting_id as string);

  const tasksQ = taskIds.length
    ? supabase
        .from("tasks")
        .select("id, title, status, priority, due_at, workspace_id, row_version")
        .in("id", taskIds)
        .is("deleted_at", null)
        .not("status", "in", "(done,canceled)")
        .limit(60)
    : Promise.resolve({ data: [], error: null });

  const meetingsQ = meetingIds.length
    ? supabase
        .from("meetings")
        .select("id, title, start_at, end_at, status, meeting_participants(user_id)")
        .in("id", meetingIds)
        .is("deleted_at", null)
        .gte("start_at", new Date(now.getTime() - 3600_000).toISOString())
        .lt("start_at", endTomorrow.toISOString())
        .order("start_at", { ascending: true })
        .limit(5)
    : Promise.resolve({ data: [], error: null });

  const notifQ = supabase
    .from("notifications")
    .select("id, type, title, body, link, is_read, created_at, meta")
    .eq("user_id", userId)
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(10);

  const emailQ = supabase
    .from("email_states")
    .select("message_id, is_read, is_starred, updated_at, email_messages(subject, sent_at, thread_id)")
    .eq("user_id", userId)
    .eq("folder", "inbox")
    .eq("is_read", false)
    .order("updated_at", { ascending: false })
    .limit(5);

  const countsQ = (
    supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: Array<{ chat: number; email: number }> | null; error: unknown }>;
    }
  ).rpc("get_unread_counts");

  const [tasksRes, meetingsRes, notifRes, emailRes, countsRes] = await Promise.all([
    tasksQ,
    meetingsQ,
    notifQ,
    emailQ,
    countsQ,
  ]);

  if (notifRes.error) partial.push("notifications");
  if ((emailRes as { error?: unknown }).error) partial.push("email");
  if ((meetingsRes as { error?: unknown }).error) partial.push("meetings");

  const taskRows = ((tasksRes as { data?: Row[] }).data ?? []) as Row[];

  // Tên workspace cho các task/meeting đang hiển thị (1 query).
  const wsIds = Array.from(
    new Set(taskRows.map((t) => t.workspace_id as string | null).filter(Boolean) as string[]),
  );
  const wsMap = new Map<string, string>();
  if (wsIds.length) {
    const { data: ws } = await supabase.from("workspaces").select("id, name").in("id", wsIds);
    for (const w of (ws ?? []) as Row[]) wsMap.set(w.id as string, w.name as string);
  }

  const myWorkAll: HomeTask[] = taskRows.map((t) => {
    const due = t.due_at ? new Date(t.due_at as string) : null;
    const overdueDays =
      due && due.getTime() < now.getTime()
        ? Math.max(1, Math.floor((now.getTime() - due.getTime()) / 86400_000))
        : null;
    return {
      id: t.id as string,
      title: (t.title as string) ?? "",
      status: (t.status as string) ?? "todo",
      priority: (t.priority as string) ?? "normal",
      due_at: (t.due_at as string | null) ?? null,
      workspace_id: (t.workspace_id as string | null) ?? null,
      workspace_name: t.workspace_id ? (wsMap.get(t.workspace_id as string) ?? null) : null,
      row_version: Number(t.row_version ?? 0),
      overdue_days: overdueDays,
    };
  });

  const isDueToday = (t: HomeTask) =>
    !!t.due_at &&
    new Date(t.due_at).getTime() >= start.getTime() &&
    new Date(t.due_at).getTime() < endToday.getTime();

  // Sort: quá hạn → hôm nay → ưu tiên cao → hạn gần.
  const bucket = (t: HomeTask) => (t.overdue_days ? 0 : isDueToday(t) ? 1 : 2);
  const myWork = myWorkAll
    .slice()
    .sort(
      (a, b) =>
        bucket(a) - bucket(b) ||
        (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
        (a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER) -
          (b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 8);

  const meetingRows = ((meetingsRes as { data?: Row[] }).data ?? []) as Row[];
  const upcoming: HomeUpcoming[] = meetingRows.map((m) => ({
    id: m.id as string,
    kind: "meeting" as const,
    title: (m.title as string) ?? "Cuộc họp",
    start_at: m.start_at as string,
    end_at: (m.end_at as string | null) ?? null,
    participants: Array.isArray(m.meeting_participants) ? m.meeting_participants.length : 0,
    joinable: m.status === "scheduled" || m.status === "live",
    href: `/meeting/${m.id}`,
  }));

  // Deadline công việc trong hôm nay/ngày mai đưa vào Upcoming.
  for (const t of myWorkAll) {
    if (!t.due_at) continue;
    const due = new Date(t.due_at).getTime();
    if (due >= now.getTime() && due < endTomorrow.getTime()) {
      upcoming.push({
        id: `task-${t.id}`,
        kind: "task",
        title: t.title,
        start_at: t.due_at,
        end_at: null,
        participants: 0,
        joinable: false,
        href: `/tasks/${t.id}`,
      });
    }
  }
  upcoming.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  // ---- Work Inbox: chỉ item "cần bạn xử lý", không phải mọi unread ----
  const notifRows = (notifRes.data ?? []) as Row[];
  const inbox: WorkInboxItem[] = [];

  const notifType = (t: string | null): WorkInboxItem["type"] => {
    const v = (t ?? "").toLowerCase();
    if (v.includes("mention")) return "MENTION";
    if (v.includes("approval") || v.includes("access_request")) return "APPROVAL";
    if (v.includes("task")) return "TASK";
    if (v.includes("meeting")) return "MEETING";
    if (v.includes("chat") || v.includes("message")) return "CHAT";
    if (v.includes("email")) return "EMAIL";
    return "NOTIFICATION";
  };
  const notifPriority = (t: WorkInboxItem["type"]): WorkInboxItem["priority"] =>
    t === "APPROVAL" || t === "MENTION" ? "urgent" : t === "TASK" || t === "MEETING" ? "high" : "normal";

  for (const n of notifRows) {
    const type = notifType(n.type as string | null);
    inbox.push({
      id: `notif-${n.id}`,
      type,
      title: (n.title as string) ?? "Thông báo",
      summary: (n.body as string | null) ?? null,
      source: "notification",
      timestamp: n.created_at as string,
      priority: notifPriority(type),
      href: (n.link as string | null) ?? `/notifications/${n.id}`,
      read: Boolean(n.is_read),
      actor: null,
    });
  }

  for (const e of ((emailRes as { data?: Row[] }).data ?? []) as Row[]) {
    const msg = (Array.isArray(e.email_messages) ? e.email_messages[0] : e.email_messages) as Row | null;
    inbox.push({
      id: `email-${e.message_id}`,
      type: "EMAIL",
      title: (msg?.subject as string) ?? "(Không tiêu đề)",
      summary: null,
      source: "email",
      timestamp: (msg?.sent_at as string) ?? (e.updated_at as string),
      priority: e.is_starred ? "high" : "normal",
      href: `/email/${e.message_id}`,
      read: false,
      actor: null,
    });
  }

  inbox.sort(
    (a, b) =>
      PRIORITY_RANK[a.priority]! - PRIORITY_RANK[b.priority]! ||
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const unread = (countsRes as { data?: Array<{ chat: number; email: number }> | null }).data?.[0];
  const counts = {
    dueToday: myWorkAll.filter(isDueToday).length,
    overdue: myWorkAll.filter((t) => t.overdue_days).length,
    mentions: inbox.filter((i) => i.type === "MENTION").length,
    approvals: inbox.filter((i) => i.type === "APPROVAL").length,
    meetings: meetingRows.filter(
      (m) => new Date(m.start_at as string).getTime() < endToday.getTime(),
    ).length,
    unreadChat: Number(unread?.chat ?? 0),
    unreadEmail: Number(unread?.email ?? 0),
    attention: 0,
  };
  counts.attention =
    counts.dueToday + counts.overdue + counts.mentions + counts.approvals + counts.meetings;

  // Brief xác định từ dữ liệu thật (không sinh nội dung AI giả).
  const brief: string[] = [];
  if (counts.overdue > 0) {
    const worst = myWork.find((t) => t.overdue_days);
    brief.push(
      `${counts.overdue} việc đang quá hạn${worst ? ` — ưu tiên “${worst.title}” (quá hạn ${worst.overdue_days} ngày)` : ""}.`,
    );
  }
  if (counts.meetings > 0) {
    const next = upcoming.find((u) => u.kind === "meeting");
    brief.push(
      `${counts.meetings} cuộc họp hôm nay${next ? ` — gần nhất “${next.title}”` : ""}.`,
    );
  }
  if (counts.approvals > 0) brief.push(`${counts.approvals} yêu cầu đang chờ bạn duyệt.`);
  if (counts.unreadEmail > 0 && brief.length < 3)
    brief.push(`${counts.unreadEmail} email chưa đọc trong hộp thư.`);
  if (counts.dueToday > 0 && brief.length < 3)
    brief.push(`${counts.dueToday} việc đến hạn hôm nay.`);

  return {
    counts,
    myWork,
    upcoming: upcoming.slice(0, 5),
    inbox: inbox.slice(0, 8),
    brief: brief.slice(0, 3),
    partial,
  };
}
