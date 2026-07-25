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