// Bố cục Dashboard lưu chung payload với My Space nhưng dùng namespace riêng.
export const DASHBOARD_PREFIX = "dashboard.";

export type DashboardSectionKey =
  | "kpis"
  | "activity"
  | "donut"
  | "projects"
  | "recent"
  | "meetings"
  | "workspaces"
  | "ai";

export type DashboardCardSize = "sm" | "md" | "lg" | "full";

export const DASHBOARD_SECTIONS: Array<{ key: DashboardSectionKey; label: string }> = [
  { key: "kpis", label: "Chỉ số KPI" },
  { key: "activity", label: "Hoạt động tổng quan" },
  { key: "donut", label: "Phân bổ công việc" },
  { key: "projects", label: "Dự án nổi bật" },
  { key: "recent", label: "Hoạt động gần đây" },
  { key: "meetings", label: "Lịch họp hôm nay" },
  { key: "workspaces", label: "Tổng quan không gian làm việc" },
  { key: "ai", label: "Trợ lý AI" },
];

export const DASHBOARD_SIZES: Array<{
  key: DashboardCardSize;
  label: string;
  hint: string;
}> = [
  { key: "sm", label: "Nhỏ", hint: "1/3 chiều rộng" },
  { key: "md", label: "Vừa", hint: "1/2 chiều rộng" },
  { key: "lg", label: "Lớn", hint: "2/3 chiều rộng" },
  { key: "full", label: "Toàn hàng", hint: "Cả hàng" },
];

export type DashboardLayoutPrefs = {
  enabled: Record<DashboardSectionKey, boolean>;
  order: DashboardSectionKey[];
  sizes: Record<DashboardSectionKey, DashboardCardSize>;
};

export const DEFAULT_DASHBOARD_ORDER = DASHBOARD_SECTIONS.map((item) => item.key);

export const DEFAULT_DASHBOARD_PREFS: DashboardLayoutPrefs = {
  enabled: Object.fromEntries(DASHBOARD_SECTIONS.map((item) => [item.key, true])) as Record<
    DashboardSectionKey,
    boolean
  >,
  order: DEFAULT_DASHBOARD_ORDER,
  sizes: {
    kpis: "full",
    activity: "lg",
    donut: "sm",
    projects: "sm",
    recent: "sm",
    meetings: "sm",
    workspaces: "full",
    ai: "md",
  },
};

const SIZE_PREFIX = `${DASHBOARD_PREFIX}size:`;

function isSection(value: string): value is DashboardSectionKey {
  return DASHBOARD_SECTIONS.some((item) => item.key === value);
}

function isSize(value: string): value is DashboardCardSize {
  return DASHBOARD_SIZES.some((item) => item.key === value);
}

export function readDashboardLayoutPrefs(
  sections: Record<string, boolean> | null,
  order: string[] | null,
): DashboardLayoutPrefs {
  const enabled = { ...DEFAULT_DASHBOARD_PREFS.enabled };
  const sizes = { ...DEFAULT_DASHBOARD_PREFS.sizes };
  const hasNamespacedValues = Object.keys(sections ?? {}).some((key) =>
    key.startsWith(DASHBOARD_PREFIX),
  );

  for (const [key, value] of Object.entries(sections ?? {})) {
    if (key.startsWith(SIZE_PREFIX)) {
      const [section, size] = key.slice(SIZE_PREFIX.length).split(":");
      if (value && section && size && isSection(section) && isSize(size)) sizes[section] = size;
      continue;
    }
    if (key.startsWith(DASHBOARD_PREFIX)) {
      const section = key.slice(DASHBOARD_PREFIX.length);
      if (isSection(section)) enabled[section] = value;
      continue;
    }
    // Tương thích cấu hình Dashboard cũ chưa có namespace.
    if (!hasNamespacedValues && isSection(key)) enabled[key] = value;
  }

  const namespacedOrder = (order ?? [])
    .filter((key) => key.startsWith(DASHBOARD_PREFIX))
    .map((key) => key.slice(DASHBOARD_PREFIX.length))
    .filter(isSection);
  const legacyOrder = (order ?? []).filter(isSection);
  const savedOrder = namespacedOrder.length ? namespacedOrder : legacyOrder;
  const normalizedOrder = [
    ...savedOrder,
    ...DEFAULT_DASHBOARD_ORDER.filter((key) => !savedOrder.includes(key)),
  ];

  return { enabled, order: normalizedOrder, sizes };
}

export function writeDashboardLayoutPrefs(
  prefs: DashboardLayoutPrefs,
  currentSections: Record<string, boolean> | null,
  currentOrder: string[] | null,
): { sections: Record<string, boolean>; order: string[] } {
  const sections: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(currentSections ?? {})) {
    if (!key.startsWith(DASHBOARD_PREFIX) && !isSection(key)) sections[key] = value;
  }
  for (const key of DEFAULT_DASHBOARD_ORDER) {
    sections[`${DASHBOARD_PREFIX}${key}`] = prefs.enabled[key];
    for (const size of DASHBOARD_SIZES) {
      sections[`${SIZE_PREFIX}${key}:${size.key}`] = prefs.sizes[key] === size.key;
    }
  }
  const keptOrder = (currentOrder ?? []).filter(
    (key) => !key.startsWith(DASHBOARD_PREFIX) && !isSection(key),
  );
  return {
    sections,
    order: [...keptOrder, ...prefs.order.map((key) => `${DASHBOARD_PREFIX}${key}`)],
  };
}

export function moveDashboardSection(
  order: DashboardSectionKey[],
  key: DashboardSectionKey,
  direction: -1 | 1,
): DashboardSectionKey[] {
  const from = order.indexOf(key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}