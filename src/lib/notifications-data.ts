import {
  Bell,
  AtSign,
  CheckCircle2,
  Video,
  FileText,
  Workflow,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export type NotifRow = Database["public"]["Tables"]["notifications"]["Row"];

export type Cat = "all" | "mention" | "task" | "meeting" | "document" | "workflow" | "system";

export type Notif = {
  id: string;
  cat: Exclude<Cat, "all">;
  actor?: string;
  title: string;
  body: string;
  time: string;
  group: "Hôm nay" | "Hôm qua" | "Tuần này" | "Cũ hơn";
  unread?: boolean;
  important?: boolean;
  /** Optional rich detail fields for the detail page */
  context?: string;
  link?: { label: string; to: string };
  details?: { label: string; value: string }[];
  actions?: { label: string; kind?: "primary" | "ghost" | "danger" }[];
};

export const CATS: { key: Cat; label: string; icon: LucideIcon; tint: string }[] = [
  { key: "all", label: "Tất cả", icon: Bell, tint: "text-foreground" },
  { key: "mention", label: "Nhắc tên", icon: AtSign, tint: "text-violet-300" },
  { key: "task", label: "Nhiệm vụ", icon: CheckCircle2, tint: "text-emerald-300" },
  { key: "meeting", label: "Họp", icon: Video, tint: "text-rose-300" },
  { key: "document", label: "Tài liệu", icon: FileText, tint: "text-sky-300" },
  { key: "workflow", label: "Quy trình", icon: Workflow, tint: "text-amber-300" },
  { key: "system", label: "Hệ thống", icon: ShieldCheck, tint: "text-primary" },
];

export function catMeta(cat: Notif["cat"]) {
  return CATS.find((c) => c.key === cat)!;
}

export const NOTIFS: Notif[] = [
  {
    id: "1",
    cat: "mention",
    actor: "Trần Thị B",
    title: "đã nhắc bạn trong #dev-team",
    body: '"@Nguyễn Văn A vui lòng review PR #482 trước 17:00 nhé."',
    time: "5 phút trước",
    group: "Hôm nay",
    unread: true,
    important: true,
    context: "Kênh #dev-team · STOS Project",
    link: { label: "Mở PR #482", to: "/search?q=PR+482" },
    details: [
      { label: "Kênh", value: "#dev-team" },
      { label: "Dự án", value: "STOS Project" },
      { label: "Hạn phản hồi", value: "Hôm nay, 17:00" },
    ],
    actions: [
      { label: "Trả lời", kind: "primary" },
      { label: "Mở hội thoại" },
    ],
  },
  {
    id: "2",
    cat: "task",
    actor: "Phạm Minh C",
    title: "đã giao nhiệm vụ cho bạn",
    body: "Thiết kế API Gateway v2.2 — hạn 15/06/2026",
    time: "32 phút trước",
    group: "Hôm nay",
    unread: true,
    context: "Bảng nhiệm vụ · STOS Project",
    link: { label: "Mở nhiệm vụ", to: "/tasks" },
    details: [
      { label: "Người giao", value: "Phạm Minh C" },
      { label: "Mức độ ưu tiên", value: "Cao" },
      { label: "Hạn hoàn thành", value: "15/06/2026" },
    ],
    actions: [
      { label: "Nhận việc", kind: "primary" },
      { label: "Xem chi tiết" },
    ],
  },
  {
    id: "3",
    cat: "meeting",
    title: "Sắp diễn ra: Sprint 6 Daily Standup",
    body: "Bắt đầu lúc 09:30 AM · 5 người tham gia",
    time: "1 giờ trước",
    group: "Hôm nay",
    unread: true,
    context: "Lịch họp định kỳ · 15 phút",
    link: { label: "Tham gia phòng họp", to: "/calendar" },
    details: [
      { label: "Bắt đầu", value: "09:30, hôm nay" },
      { label: "Thời lượng", value: "15 phút" },
      { label: "Người tham gia", value: "5 thành viên" },
    ],
    actions: [
      { label: "Tham gia ngay", kind: "primary" },
      { label: "Xem lịch" },
    ],
  },
  {
    id: "4",
    cat: "document",
    actor: "Phạm Minh C",
    title: "đã cập nhật tài liệu",
    body: "API_Gateway_Spec_v2.1.docx trong STOS Project",
    time: "2 giờ trước",
    group: "Hôm nay",
    context: "Thư mục: STOS Project / Specs",
    link: { label: "Mở tài liệu", to: "/documents" },
    actions: [{ label: "Xem khác biệt", kind: "primary" }, { label: "Mở tài liệu" }],
  },
  {
    id: "5",
    cat: "workflow",
    actor: "Lê Hoàng D",
    title: "cần bạn phê duyệt",
    body: "Approval — Leave Request của Nguyễn Hương (3 ngày)",
    time: "3 giờ trước",
    group: "Hôm nay",
    unread: true,
    important: true,
    context: "Quy trình: HR · Nghỉ phép",
    link: { label: "Mở phiếu phê duyệt", to: "/workflows" },
    details: [
      { label: "Người yêu cầu", value: "Nguyễn Hương" },
      { label: "Loại nghỉ", value: "Nghỉ phép có lương" },
      { label: "Số ngày", value: "3 ngày" },
      { label: "Thời gian", value: "20–22/06/2026" },
    ],
    actions: [
      { label: "Phê duyệt", kind: "primary" },
      { label: "Từ chối", kind: "danger" },
      { label: "Xem chi tiết" },
    ],
  },
  {
    id: "6",
    cat: "system",
    title: "Bảo trì định kỳ hệ thống",
    body: "Hệ thống sẽ bảo trì vào 22:00 ngày 25/05/2026 (GMT+7), ngừng dịch vụ ~30 phút.",
    time: "Hôm qua, 18:00",
    group: "Hôm qua",
    context: "Thông báo từ Quản trị hệ thống",
    actions: [{ label: "Đã hiểu", kind: "primary" }],
  },
  {
    id: "7",
    cat: "mention",
    actor: "Nguyễn Hương",
    title: "đã bình luận trong tài liệu",
    body: '"Phần API Gateway có thể chia nhỏ section 3 không?"',
    time: "Hôm qua, 14:22",
    group: "Hôm qua",
    context: "API_Gateway_Spec_v2.1.docx · Section 3",
    link: { label: "Trả lời bình luận", to: "/documents" },
    actions: [{ label: "Trả lời", kind: "primary" }, { label: "Mở tài liệu" }],
  },
  {
    id: "8",
    cat: "task",
    actor: "Trần Thị B",
    title: "đã hoàn thành nhiệm vụ",
    body: "Thiết kế UI Dashboard — STOS Project",
    time: "Hôm qua, 09:45",
    group: "Hôm qua",
    context: "STOS Project · Sprint 6",
    actions: [{ label: "Xem kết quả", kind: "primary" }],
  },
  {
    id: "9",
    cat: "meeting",
    title: "Tóm tắt cuộc họp: Review API Gateway",
    body: "5 quyết định, 7 hành động được tạo. Xem tóm tắt AI.",
    time: "Hôm qua, 11:30",
    group: "Hôm qua",
    context: "Tóm tắt tự động bởi AI",
    link: { label: "Xem tóm tắt", to: "/calendar" },
    actions: [{ label: "Mở tóm tắt", kind: "primary" }],
  },
  {
    id: "10",
    cat: "document",
    actor: "Bạn",
    title: "đã được chia sẻ tài liệu",
    body: "Kế hoạch tuyển dụng Q3 — UNI-HRM workspace",
    time: "T3, 16:10",
    group: "Tuần này",
    context: "UNI-HRM · Quyền: Có thể chỉnh sửa",
    link: { label: "Mở tài liệu", to: "/documents" },
  },
  {
    id: "11",
    cat: "system",
    title: "Đăng nhập thiết bị mới",
    body: "UNIWORK iOS · Hà Nội, Việt Nam · IP 14.232.xxx.12",
    time: "T2, 08:05",
    group: "Tuần này",
    important: true,
    context: "Cảnh báo bảo mật",
    details: [
      { label: "Thiết bị", value: "UNIWORK iOS" },
      { label: "Vị trí", value: "Hà Nội, Việt Nam" },
      { label: "IP", value: "14.232.xxx.12" },
      { label: "Thời gian", value: "T2, 08:05" },
    ],
    actions: [
      { label: "Đây là tôi", kind: "primary" },
      { label: "Đăng xuất thiết bị", kind: "danger" },
    ],
  },
];

export function findNotif(id: string) {
  return NOTIFS.find((n) => n.id === id);
}

export function removeNotif(id: string) {
  const idx = NOTIFS.findIndex((n) => n.id === id);
  if (idx !== -1) NOTIFS.splice(idx, 1);
}

// ------------------------------------------------------------------
// DB row → UI Notif mapper
// ------------------------------------------------------------------

const KNOWN_CATS = new Set<Notif["cat"]>([
  "mention",
  "task",
  "meeting",
  "document",
  "workflow",
  "system",
]);

function relativeTime(iso: string) {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((now - t) / 1000));
  if (s < 60) return `${s} giây trước`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

function groupOf(iso: string): Notif["group"] {
  const d = new Date(iso);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const t = d.getTime();
  if (t >= startToday) return "Hôm nay";
  if (t >= startToday - 86400_000) return "Hôm qua";
  if (t >= startToday - 7 * 86400_000) return "Tuần này";
  return "Cũ hơn";
}

export function mapNotifRow(row: NotifRow): Notif {
  const cat = (KNOWN_CATS.has(row.type as Notif["cat"]) ? row.type : "system") as Notif["cat"];
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const linkLabel = typeof meta.linkLabel === "string" ? meta.linkLabel : "Xem chi tiết";
  return {
    id: row.id,
    cat,
    actor: typeof meta.actor === "string" ? meta.actor : undefined,
    title: row.title,
    body: row.body ?? "",
    time: relativeTime(row.created_at),
    group: groupOf(row.created_at),
    unread: !row.is_read,
    important: meta.important === true,
    context: typeof meta.context === "string" ? meta.context : undefined,
    link: row.link ? { label: linkLabel, to: row.link } : undefined,
    details: Array.isArray(meta.details) ? (meta.details as Notif["details"]) : undefined,
    actions: Array.isArray(meta.actions) ? (meta.actions as Notif["actions"]) : undefined,
  };
}
// ------------------------------------------------------------------
// Sắp xếp: Mới nhất / Ưu tiên (dùng chung dashboard + /notifications)
// ------------------------------------------------------------------

export type NotifSortMode = "recent" | "priority";

const NOTIF_TYPE_WEIGHT: Record<string, number> = {
  alert: 40,
  quota: 35,
  billing: 35,
  security: 40,
  mention: 30,
  task: 20,
  meeting: 20,
  workflow: 15,
  chat: 10,
  system: 5,
};

/** Điểm ưu tiên của một dòng notification (row DB). */
export function notifPriorityRank(n: {
  type?: string | null;
  meta?: unknown;
  is_read?: boolean | null;
}): number {
  const type = String(n?.type ?? "").toLowerCase();
  const meta = (n?.meta ?? {}) as Record<string, unknown>;
  const metaPriority = String(meta.priority ?? "").toLowerCase();
  const metaWeight =
    metaPriority === "urgent" ? 60 : metaPriority === "high" ? 45 : metaPriority === "low" ? -10 : 0;
  const important = meta.important === true ? 30 : 0;
  const typeWeight = Object.entries(NOTIF_TYPE_WEIGHT).find(([k]) => type.includes(k))?.[1] ?? 10;
  return typeWeight + metaWeight + important + (n?.is_read ? 0 : 25);
}

/** Sắp xếp danh sách row theo chế độ đã chọn (không mutate mảng gốc). */
export function sortNotifRows<T extends { created_at?: string | null }>(
  rows: T[],
  mode: NotifSortMode,
): T[] {
  const time = (n: T) => new Date(n.created_at ?? 0).getTime();
  const out = [...rows];
  if (mode === "priority") {
    out.sort(
      (a, b) =>
        notifPriorityRank(b as never) - notifPriorityRank(a as never) || time(b) - time(a),
    );
  } else {
    out.sort((a, b) => time(b) - time(a));
  }
  return out;
}
