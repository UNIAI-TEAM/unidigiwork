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

export async function loadHomeSummary(supabase: Db, _userId: string): Promise<HomeSummary> {
  const now = new Date();
  const { start, endToday } = dayBounds(now);
  const partial: string[] = [];

  const [homeRes, countsRes] = await Promise.all([
    (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
    }).rpc("get_home_summary"),
    (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: Array<{ chat: number; email: number }> | null; error: unknown }>;
    }).rpc("get_unread_counts"),
  ]);

  if (homeRes.error) throw new Error(homeRes.error.message);
  const payload = (homeRes.data ?? {}) as {
    counts?: { dueToday?: number; overdue?: number; meetings?: number };
    myWork?: Row[];
    meetings?: Row[];
    taskDeadlines?: Row[];
    notifications?: Row[];
    emails?: Row[];
  };
  if ((countsRes as { error?: unknown }).error) partial.push("unread");
  if (payload.myWork == null) partial.push("tasks");
  if (payload.meetings == null && payload.taskDeadlines == null) partial.push("upcoming");

  const myWork: HomeTask[] = (payload.myWork ?? []).map((t) => ({
    id: t.id as string,
    title: (t.title as string) ?? "",
    status: (t.status as string) ?? "todo",
    priority: (t.priority as string) ?? "normal",
    due_at: (t.due_at as string | null) ?? null,
    workspace_id: (t.workspace_id as string | null) ?? null,
    workspace_name: (t.workspace_name as string | null) ?? null,
    row_version: Number(t.row_version ?? 0),
    overdue_days: t.overdue_days == null ? null : Number(t.overdue_days),
  }));

  const upcoming: HomeUpcoming[] = (payload.meetings ?? []).map((m) => ({
    id: m.id as string,
    kind: "meeting" as const,
    title: (m.title as string) ?? "Cuộc họp",
    start_at: m.start_at as string,
    end_at: (m.end_at as string | null) ?? null,
    participants: Number(m.participants ?? 0),
    joinable: m.status === "scheduled" || m.status === "live",
    href: `/meeting/${m.id}`,
  }));

  for (const d of payload.taskDeadlines ?? []) {
    upcoming.push({
      id: `task-${d.id}`,
      kind: "task",
      title: (d.title as string) ?? "",
      start_at: d.due_at as string,
      end_at: null,
      participants: 0,
      joinable: false,
      href: `/tasks/${d.id}`,
    });
  }
  upcoming.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  // ---- Work Inbox: chỉ item "cần bạn xử lý", không phải mọi unread ----
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

  // Deep link theo nguồn: ưu tiên id thực thể trong meta, sau đó tới link đã lưu,
  // cuối cùng mới fallback về trang chi tiết thông báo.
  const deepLink = (type: WorkInboxItem["type"], meta: Record<string, unknown>, link: string | null, id: string) => {
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = meta[k];
        if (typeof v === "string" && v.length > 0) return v;
      }
      return null;
    };
    const taskId = pick("task_id", "taskId");
    const meetingId = pick("meeting_id", "meetingId");
    const channelId = pick("channel_id", "channelId");
    const messageId = pick("message_id", "messageId", "email_message_id");
    const docId = pick("document_id", "documentId");

    if (type === "TASK" && taskId) return `/tasks/${taskId}`;
    if (type === "MEETING" && meetingId) return `/meeting/${meetingId}`;
    if (type === "CHAT" && channelId)
      return `/chat/${channelId}${messageId ? `?m=${messageId}` : ""}`;
    if (type === "MENTION") {
      if (channelId) return `/chat/${channelId}${messageId ? `?m=${messageId}` : ""}`;
      if (taskId) return `/tasks/${taskId}`;
    }
    if (type === "EMAIL" && messageId) return `/email/${messageId}`;
    if (type === "APPROVAL") return link && !link.startsWith("/m/") ? link : "/workflows";
    if (docId) return `/documents?doc=${docId}`;

    // Link đã lưu có thể trỏ tới bản mobile (/m/...) — quy về route desktop tương ứng.
    if (link) {
      const desktop = link.startsWith("/m/") ? link.replace(/^\/m/, "") : link;
      return desktop === "/tasks" || desktop === "/chat" || desktop === "/email" || desktop === "/meet"
        ? desktop === "/meet"
          ? "/meetings"
          : desktop
        : desktop;
    }
    return `/notifications/${id}`;
  };

  for (const n of payload.notifications ?? []) {
    const type = notifType(n.type as string | null);
    const meta = (n.meta as Record<string, unknown> | null) ?? {};
    inbox.push({
      id: `notif-${n.id}`,
      type,
      title: (n.title as string) ?? "Thông báo",
      summary: (n.body as string | null) ?? null,
      source: "notification",
      timestamp: n.created_at as string,
      priority: notifPriority(type),
      href: deepLink(type, meta, (n.link as string | null) ?? null, n.id as string),
      read: Boolean(n.is_read),
      actor: null,
    });
  }

  for (const e of payload.emails ?? []) {
    inbox.push({
      id: `email-${e.message_id}`,
      type: "EMAIL",
      title: (e.subject as string) ?? "(Không tiêu đề)",
      summary: null,
      source: "email",
      timestamp: (e.sent_at as string) ?? (e.updated_at as string),
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
    dueToday: Number(payload.counts?.dueToday ?? 0),
    overdue: Number(payload.counts?.overdue ?? 0),
    mentions: inbox.filter((i) => i.type === "MENTION").length,
    approvals: inbox.filter((i) => i.type === "APPROVAL").length,
    meetings: Number(payload.counts?.meetings ?? 0),
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
    brief.push(`${counts.meetings} cuộc họp hôm nay${next ? ` — gần nhất “${next.title}”` : ""}.`);
  }
  if (counts.approvals > 0) brief.push(`${counts.approvals} yêu cầu đang chờ bạn duyệt.`);
  if (counts.unreadEmail > 0 && brief.length < 3)
    brief.push(`${counts.unreadEmail} email chưa đọc trong hộp thư.`);
  if (counts.dueToday > 0 && brief.length < 3)
    brief.push(`${counts.dueToday} việc đến hạn hôm nay.`);

  void start;
  void endToday;

  return {
    counts,
    myWork: myWork.slice(0, 8),
    upcoming: upcoming.slice(0, 5),
    inbox: inbox.slice(0, 8),
    brief: brief.slice(0, 3),
    partial,
  };
}
