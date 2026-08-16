/**
 * UNIWORK — Navigation single source of truth (Information Architecture V2).
 *
 * Chỉ chứa metadata điều hướng: id, nhãn i18n, icon, route, nhóm, quyền,
 * vị trí trên mobile. KHÔNG import API/business logic vào file này
 * (xem src/lib/architecture/navigation-config.test.ts).
 */
import {
  Inbox,
  ListChecks,
  Calendar,
  LayoutGrid,
  MessageSquare,
  Video,
  Mail,
  FileText,
  BookOpen,
  Workflow,
  Bot,
  LayoutDashboard,
  BarChart3,
  Users,
  ShieldCheck,
  CreditCard,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Key } from "@/lib/i18n";

/**
 * Icon system — nguồn duy nhất cho mọi icon điều hướng.
 * Toàn bộ icon dùng cùng family (lucide), cùng kích thước 18px và cùng độ dày nét.
 */
export const NAV_ICON_SIZE = 18;
export const NAV_ICON_CLASS = "h-[18px] w-[18px] shrink-0";
export const NAV_ICON_STROKE = 1.75;
export const NAV_ICON_STROKE_ACTIVE = 2.25;

export type NavGroupId =
  | "home"
  | "work"
  | "communication"
  | "knowledge"
  | "automation"
  | "insights"
  | "admin";

/** Badge dùng lại các count sẵn có — không tạo query mới cho sidebar. */
export type NavBadge = "notifications" | "chat" | "email" | "live";

/** Quyền hiển thị. Chỉ dùng cho UX; backend vẫn là security authority. */
export type NavVisibility = "everyone" | "admin";

export type NavItem = {
  id: string;
  labelKey: Key;
  icon: LucideIcon;
  href: string;
  group: NavGroupId;
  /** Prefix dùng cho active state ở route con/detail. Mặc định là href. */
  match?: string[];
  visibility: NavVisibility;
  badge?: NavBadge;
  order: number;
  /** Vị trí trên mobile PWA. */
  mobile?: { placement: "primary" | "more"; href: string; order: number };
};

export type NavGroup = {
  id: NavGroupId;
  labelKey: Key;
  order: number;
  /** HOME luôn mở, không cho collapse. */
  collapsible: boolean;
};

export const NAV_GROUPS: NavGroup[] = [
  { id: "home", labelKey: "nav.group.home", order: 1, collapsible: false },
  { id: "work", labelKey: "nav.group.work", order: 2, collapsible: true },
  { id: "communication", labelKey: "nav.group.communication", order: 3, collapsible: true },
  { id: "knowledge", labelKey: "nav.group.knowledge", order: 4, collapsible: true },
  { id: "automation", labelKey: "nav.group.automation", order: 5, collapsible: true },
  { id: "insights", labelKey: "nav.group.insights", order: 6, collapsible: true },
  { id: "admin", labelKey: "nav.group.admin", order: 7, collapsible: true },
];

export const NAV_ITEMS: NavItem[] = [
  // HOME — điểm bắt đầu là việc của tôi, không phải KPI dashboard.
  {
    id: "my-work",
    labelKey: "nav.mywork",
    icon: ListChecks,
    href: "/tasks",
    group: "home",
    match: ["/tasks"],
    visibility: "everyone",
    order: 1,
    mobile: { placement: "primary", href: "/m/tasks", order: 3 },
  },
  {
    id: "inbox",
    labelKey: "nav.inbox",
    icon: Inbox,
    href: "/notifications",
    group: "home",
    match: ["/notifications"],
    visibility: "everyone",
    badge: "notifications",
    order: 2,
    mobile: { placement: "more", href: "/notifications", order: 5 },
  },

  // WORK
  {
    id: "workspaces",
    labelKey: "nav.projects",
    icon: LayoutGrid,
    href: "/workspace",
    group: "work",
    match: ["/workspace"],
    visibility: "everyone",
    order: 1,
  },
  {
    id: "calendar",
    labelKey: "nav.calendar",
    icon: Calendar,
    href: "/calendar",
    group: "work",
    match: ["/calendar"],
    visibility: "everyone",
    order: 2,
    mobile: { placement: "more", href: "/calendar", order: 1 },
  },
  {
    id: "people",
    labelKey: "nav.people",
    icon: Users,
    href: "/people",
    group: "work",
    match: ["/people"],
    visibility: "everyone",
    order: 3,
    mobile: { placement: "more", href: "/people", order: 4 },
  },

  // COMMUNICATION
  {
    id: "chat",
    labelKey: "nav.chat",
    icon: MessageSquare,
    href: "/chat",
    group: "communication",
    match: ["/chat"],
    visibility: "everyone",
    badge: "chat",
    order: 1,
    mobile: { placement: "primary", href: "/m/chat", order: 2 },
  },
  {
    id: "meetings",
    labelKey: "nav.meetings",
    icon: Video,
    href: "/meeting",
    group: "communication",
    match: ["/meeting"],
    visibility: "everyone",
    badge: "live",
    order: 2,
    mobile: { placement: "primary", href: "/m/meet", order: 4 },
  },
  {
    id: "email",
    labelKey: "nav.email",
    icon: Mail,
    href: "/email",
    group: "communication",
    match: ["/email"],
    visibility: "everyone",
    badge: "email",
    order: 3,
    mobile: { placement: "more", href: "/m/email", order: 0 },
  },

  // KNOWLEDGE
  {
    id: "documents",
    labelKey: "nav.documents",
    icon: FileText,
    href: "/documents",
    group: "knowledge",
    match: ["/documents"],
    visibility: "everyone",
    order: 1,
    mobile: { placement: "more", href: "/documents", order: 2 },
  },
  {
    id: "knowledge",
    labelKey: "nav.knowledge",
    icon: BookOpen,
    href: "/knowledge",
    group: "knowledge",
    match: ["/knowledge"],
    visibility: "everyone",
    order: 2,
    mobile: { placement: "more", href: "/knowledge", order: 3 },
  },

  // AUTOMATION
  {
    id: "workflows",
    labelKey: "nav.workflows",
    icon: Workflow,
    href: "/workflows",
    group: "automation",
    match: ["/workflows"],
    visibility: "everyone",
    order: 1,
    mobile: { placement: "more", href: "/workflows", order: 6 },
  },
  {
    id: "ai",
    labelKey: "nav.ai",
    icon: Bot,
    href: "/ai",
    group: "automation",
    match: ["/ai"],
    visibility: "everyone",
    order: 2,
    mobile: { placement: "more", href: "/ai", order: 7 },
  },

  // INSIGHTS
  {
    id: "dashboard",
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
    group: "insights",
    match: ["/dashboard"],
    visibility: "everyone",
    order: 1,
    mobile: { placement: "more", href: "/dashboard", order: 8 },
  },
  {
    id: "reports",
    labelKey: "nav.reports",
    icon: BarChart3,
    href: "/reports",
    group: "insights",
    match: ["/reports"],
    visibility: "everyone",
    order: 2,
    mobile: { placement: "more", href: "/reports", order: 9 },
  },

  // ADMIN — chỉ hiện khi có quyền quản trị.
  {
    id: "admin-console",
    labelKey: "nav.admin",
    icon: ShieldCheck,
    href: "/admin",
    group: "admin",
    match: ["/admin"],
    visibility: "admin",
    order: 1,
    mobile: { placement: "more", href: "/admin", order: 10 },
  },
  {
    id: "audit",
    labelKey: "nav.security",
    icon: ScrollText,
    href: "/workspace/audit",
    group: "admin",
    match: ["/workspace/audit"],
    visibility: "admin",
    order: 2,
  },
  {
    id: "billing",
    labelKey: "nav.billing",
    icon: CreditCard,
    href: "/billing",
    group: "admin",
    match: ["/billing"],
    visibility: "admin",
    order: 3,
    mobile: { placement: "more", href: "/billing", order: 11 },
  },
];

export type NavPermissions = { isAdmin: boolean };

export function isNavItemVisible(item: NavItem, perms: NavPermissions) {
  return item.visibility === "everyone" || perms.isAdmin;
}

/** Nhóm đã lọc quyền; nhóm rỗng bị loại bỏ hoàn toàn (không render heading rỗng). */
export function visibleNavigation(perms: NavPermissions) {
  return NAV_GROUPS.slice()
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      group,
      items: NAV_ITEMS.filter((i) => i.group === group.id && isNavItemVisible(i, perms)).sort(
        (a, b) => a.order - b.order,
      ),
    }))
    .filter((g) => g.items.length > 0);
}

/** Active state đúng cho cả route detail/nested (/tasks/123 → My Work). */
export function isNavItemActive(item: NavItem, pathname: string) {
  const prefixes = item.match ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function findActiveNavItem(pathname: string, perms: NavPermissions) {
  const candidates = NAV_ITEMS.filter(
    (i) => isNavItemVisible(i, perms) && isNavItemActive(i, pathname),
  );
  // Ưu tiên match dài nhất: /workspace/audit thắng /workspace.
  return (
    candidates.sort(
      (a, b) =>
        Math.max(...(b.match ?? [b.href]).map((m) => m.length)) -
        Math.max(...(a.match ?? [a.href]).map((m) => m.length)),
    )[0] ?? null
  );
}

/** Mobile: tối đa 5 tab chính (4 từ config + tab "Thêm"). */
export const MOBILE_PRIMARY_ITEMS = NAV_ITEMS.filter(
  (i) => i.mobile?.placement === "primary",
).sort((a, b) => (a.mobile?.order ?? 0) - (b.mobile?.order ?? 0));

export const MOBILE_MORE_ITEMS = NAV_ITEMS.filter((i) => i.mobile?.placement === "more").sort(
  (a, b) => (a.mobile?.order ?? 0) - (b.mobile?.order ?? 0),
);
