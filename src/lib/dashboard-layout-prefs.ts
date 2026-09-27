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
export type DashboardCardHeight = "auto" | "short" | "medium" | "tall";

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

export const DASHBOARD_HEIGHTS: Array<{
  key: DashboardCardHeight;
  label: string;
  hint: string;
}> = [
  { key: "auto", label: "Tự động", hint: "Theo nội dung" },
  { key: "short", label: "Thấp", hint: "240px" },
  { key: "medium", label: "Vừa", hint: "360px" },
  { key: "tall", label: "Cao", hint: "520px" },
];

export type DashboardLayoutPrefs = {
  enabled: Record<DashboardSectionKey, boolean>;
  order: DashboardSectionKey[];
  sizes: Record<DashboardSectionKey, DashboardCardSize>;
  heights: Record<DashboardSectionKey, DashboardCardHeight>;
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
  heights: Object.fromEntries(DASHBOARD_SECTIONS.map((item) => [item.key, "auto"])) as Record<
    DashboardSectionKey,
    DashboardCardHeight
  >,
};

const SIZE_PREFIX = `${DASHBOARD_PREFIX}size:`;
const HEIGHT_PREFIX = `${DASHBOARD_PREFIX}height:`;

function isSection(value: string): value is DashboardSectionKey {
  return DASHBOARD_SECTIONS.some((item) => item.key === value);
}

function isSize(value: string): value is DashboardCardSize {
  return DASHBOARD_SIZES.some((item) => item.key === value);
}

function isHeight(value: string): value is DashboardCardHeight {
  return DASHBOARD_HEIGHTS.some((item) => item.key === value);
}

export function readDashboardLayoutPrefs(
  sections: Record<string, boolean> | null,
  order: string[] | null,
): DashboardLayoutPrefs {
  const enabled = { ...DEFAULT_DASHBOARD_PREFS.enabled };
  const sizes = { ...DEFAULT_DASHBOARD_PREFS.sizes };
  const heights = { ...DEFAULT_DASHBOARD_PREFS.heights };
  const hasNamespacedValues = Object.keys(sections ?? {}).some((key) =>
    key.startsWith(DASHBOARD_PREFIX),
  );

  for (const [key, value] of Object.entries(sections ?? {})) {
    if (key.startsWith(HEIGHT_PREFIX)) {
      const [section, height] = key.slice(HEIGHT_PREFIX.length).split(":");
      if (value && section && height && isSection(section) && isHeight(height)) {
        heights[section] = height;
      }
      continue;
    }
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

  return { enabled, order: normalizedOrder, sizes, heights };
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
    for (const height of DASHBOARD_HEIGHTS) {
      sections[`${HEIGHT_PREFIX}${key}:${height.key}`] = prefs.heights[key] === height.key;
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
