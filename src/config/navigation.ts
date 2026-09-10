/**
 * UNIWORK — Navigation single source of truth (Information Architecture V2).
 *
 * Chỉ chứa metadata điều hướng: id, nhãn i18n, icon, route, nhóm, quyền,
 * vị trí trên mobile. KHÔNG import API/business logic vào file này
 * (xem src/lib/architecture/navigation-config.test.ts).
 */
import {
  Home,
  ListChecks,
  Calendar,
  LayoutGrid,
  Folder,
  MessageSquare,
  Video,
  Mail,
  FileText,
  BookOpen,
  Workflow,
  Bot,
  BotMessageSquare,
  BrainCircuit,
  BarChart3,
  Users,
  ShieldCheck,
  CreditCard,
  ScrollText,
  Store,
  Sparkles,
  ClipboardList,
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
  | "results"
  | "knowledge"
  | "automation"
  | "organization";

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
  { id: "results", labelKey: "nav.group.results", order: 4, collapsible: true },
  { id: "knowledge", labelKey: "nav.group.knowledge", order: 5, collapsible: true },
  { id: "automation", labelKey: "nav.group.automation", order: 6, collapsible: true },
  { id: "organization", labelKey: "nav.group.organization", order: 7, collapsible: true },
];

export const NAV_ITEMS: NavItem[] = [
  // HOME — các điểm vào cá nhân luôn hiển thị, không collapse.
  {
    id: "home",
    labelKey: "nav.home",
    icon: Home,
    href: "/dashboard",
    group: "home",
    match: ["/dashboard"],
    visibility: "everyone",
    order: 0,
  },
  {
    id: "my-space",
    labelKey: "nav.myspace",
    icon: Users,
    href: "/home",
    group: "home",
    match: ["/home", "/notifications"],
    visibility: "everyone",
    order: 1,
    badge: "notifications",
  },
  {
    id: "calendar",
    labelKey: "nav.calendar",
    icon: Calendar,
    href: "/calendar",
    group: "home",
    match: ["/calendar"],
    visibility: "everyone",
    order: 2,
    mobile: { placement: "more", href: "/calendar", order: 1 },
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
    id: "projects",
    labelKey: "nav.projectList",
    icon: Folder,
    href: "/projects",
    group: "work",
    match: ["/projects"],
    visibility: "everyone",
    order: 2,
    mobile: { placement: "more", href: "/projects", order: 2 },
  },
  {
    id: "tasks",
    labelKey: "nav.taskList",
    icon: ListChecks,
    href: "/tasks",
    group: "work",
    match: ["/tasks"],
    visibility: "everyone",
    order: 3,
  },
  {
    id: "workflows",
    labelKey: "nav.workflows",
    icon: Workflow,
    href: "/workflows",
    group: "work",
    match: ["/workflows"],
    visibility: "everyone",
    order: 4,
    mobile: { placement: "more", href: "/workflows", order: 6 },
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
    mobile: { placement: "more", href: "/m/meet", order: 2 },
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

  // RESULTS
  {
    id: "work-products",
    labelKey: "nav.workProducts",
    icon: ClipboardList,
    href: "/work-products",
    group: "results",
    match: ["/work-products"],
    visibility: "everyone",
    order: 1,
    mobile: { placement: "more", href: "/m/work-products", order: 3 },
  },
  {
    id: "documents",
    labelKey: "nav.documents",
    icon: FileText,
    href: "/documents",
    group: "results",
    match: ["/documents"],
    visibility: "everyone",
    order: 1,
    mobile: { placement: "more", href: "/documents", order: 2 },
  },
  // KNOWLEDGE
  {
    id: "knowledge",
    labelKey: "nav.knowledge",
    icon: BookOpen,
    href: "/knowledge",
    group: "knowledge",
    match: ["/knowledge"],
    visibility: "everyone",
    order: 1,
    mobile: { placement: "more", href: "/knowledge", order: 4 },
  },

  // AUTOMATION
  {
    id: "ai",
    labelKey: "nav.ai",
    icon: Bot,
    href: "/ai",
    group: "automation",
    match: ["/ai"],
    visibility: "everyone",
    order: 1,
    mobile: { placement: "more", href: "/ai", order: 7 },
  },

  {
    id: "ai-brain",
    labelKey: "nav.aiBrain",
    icon: BrainCircuit,
    href: "/ai-brain",
    group: "automation",
    match: ["/ai-brain"],
    visibility: "everyone",
    order: 1.5,
    mobile: { placement: "more", href: "/ai-brain", order: 7.2 },
  },
  {
    id: "ai-agents",
    labelKey: "nav.aiAgents",
    icon: Workflow,
    href: "/workflows/agents",
    group: "automation",
    match: ["/workflows/agents"],
    visibility: "everyone",
    order: 1.6,
    mobile: { placement: "more", href: "/workflows/agents", order: 7.3 },
  },
  {
    id: "ai-skills",
    labelKey: "nav.aiSkills",
    icon: Sparkles,
    href: "/ai-brain/skills",
    group: "automation",
    match: ["/ai-brain/skills"],
    visibility: "everyone",
    order: 1.7,
    mobile: { placement: "more", href: "/ai-brain/skills", order: 7.4 },
  },
  {
    id: "ai-workforce",
    labelKey: "nav.aiWorkforce",
    icon: BotMessageSquare,
    href: "/ai-workforce",
    group: "automation",
    match: ["/ai-workforce"],
    visibility: "everyone",
    order: 2,
    mobile: { placement: "more", href: "/m/ai-workforce", order: 7.5 },
  },
  {
    id: "work-catalog",
    labelKey: "nav.workCatalog",
    icon: ClipboardList,
    href: "/work-catalog",
    group: "automation",
    match: ["/work-catalog"],
    visibility: "everyone",
    order: 3,
  },
  {
    id: "ai-market",
    labelKey: "nav.aiMarket",
    icon: Store,
    href: "/ai-market",
    group: "automation",
    match: ["/ai-market"],
    visibility: "everyone",
    order: 4,
    mobile: { placement: "more", href: "/m/ai-market", order: 7.6 },
  },

  // ORGANIZATION
  {
    id: "people",
    labelKey: "nav.people",
    icon: Users,
    href: "/people",
    group: "organization",
    match: ["/people"],
    visibility: "everyone",
    order: 1,
    mobile: { placement: "more", href: "/people", order: 4 },
  },
  {
    id: "reports",
    labelKey: "nav.reports",
    icon: BarChart3,
    href: "/reports",
    group: "organization",
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
    group: "organization",
    match: ["/admin"],
    visibility: "admin",
    order: 3,
    mobile: { placement: "more", href: "/admin", order: 10 },
  },
  {
    id: "audit",
    labelKey: "nav.security",
    icon: ScrollText,
    href: "/workspace/audit",
    group: "organization",
    match: ["/workspace/audit"],
    visibility: "admin",
    order: 4,
  },
  {
    id: "billing",
    labelKey: "nav.billing",
    icon: CreditCard,
    href: "/billing",
    group: "organization",
    match: ["/billing"],
    visibility: "admin",
    order: 5,
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
      items: NAV_ITEMS.filter(
        (i) => i.group === group.id && isNavItemVisible(i, perms) && true,
      ).sort((a, b) => a.order - b.order),
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
export const MOBILE_PRIMARY_ITEMS = NAV_ITEMS.filter((i) => i.mobile?.placement === "primary").sort(
  (a, b) => (a.mobile?.order ?? 0) - (b.mobile?.order ?? 0),
);

export const MOBILE_MORE_ITEMS = NAV_ITEMS.filter((i) => i.mobile?.placement === "more").sort(
  (a, b) => (a.mobile?.order ?? 0) - (b.mobile?.order ?? 0),
);
