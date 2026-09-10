// Tuỳ biến Home theo từng user: bật/tắt khối, thứ tự khối, mật độ bố cục.
// Dùng chung bảng user_dashboard_prefs với Dashboard, phân biệt bằng tiền tố "home.".

export const HOME_PREFIX = "home.";

export type HomeSectionKey = "stats" | "mywork" | "upcoming" | "inbox" | "aibrief";

export type HomeLayout = "compact" | "balanced" | "wide";

export const HOME_SECTION_META: Record<HomeSectionKey, { label: string; description: string }> = {
  stats: { label: "Tổng quan hôm nay", description: "Số việc quá hạn, đến hạn, cần chú ý" },
  mywork: { label: "Công việc của tôi", description: "Danh sách việc cần xử lý" },
  upcoming: { label: "Sắp tới", description: "Cuộc họp và deadline gần nhất" },
  inbox: { label: "Hộp việc", description: "Thông báo, nhắc đến, email chưa đọc" },
  aibrief: { label: "Tóm tắt AI", description: "Bản tóm tắt ngày làm việc" },
};

export const DEFAULT_HOME_ORDER: HomeSectionKey[] = [
  "stats",
  "mywork",
  "inbox",
  "upcoming",
  "aibrief",
];

export const HOME_LAYOUTS: { key: HomeLayout; label: string; hint: string }[] = [
  { key: "compact", label: "Gọn", hint: "1 cột, tập trung việc cần làm" },
  { key: "balanced", label: "Cân bằng", hint: "2 cột (mặc định)" },
  { key: "wide", label: "Rộng", hint: "3 cột trên màn hình lớn" },
];

export type HomeSize = "sm" | "md" | "lg" | "full";

export const HOME_SIZES: { key: HomeSize; label: string; hint: string; span: number }[] = [
  { key: "sm", label: "Nhỏ", hint: "1/3 chiều rộng", span: 4 },
  { key: "md", label: "Vừa", hint: "1/2 chiều rộng", span: 6 },
  { key: "lg", label: "Lớn", hint: "2/3 chiều rộng", span: 8 },
  { key: "full", label: "Toàn màn", hint: "Cả hàng", span: 12 },
];

export const DEFAULT_HOME_SIZES: Record<HomeSectionKey, HomeSize> = {
  stats: "full",
  mywork: "lg",
  upcoming: "sm",
  inbox: "sm",
  aibrief: "lg",
};

export function isHomeSize(v: string): v is HomeSize {
  return v === "sm" || v === "md" || v === "lg" || v === "full";
}

export type HomePrefs = {
  enabled: Record<HomeSectionKey, boolean>;
  order: HomeSectionKey[];
  layout: HomeLayout;
  sizes: Record<HomeSectionKey, HomeSize>;
};

export const DEFAULT_HOME_PREFS: HomePrefs = {
  enabled: { stats: true, mywork: true, upcoming: true, inbox: true, aibrief: true },
  order: DEFAULT_HOME_ORDER,
  layout: "balanced",
  sizes: DEFAULT_HOME_SIZES,
};

export const HOME_PRESETS: {
  key: string;
  label: string;
  description: string;
  prefs: HomePrefs;
}[] = [
  {
    key: "executive",
    label: "Điều hành",
    description: "Số liệu, tóm tắt AI và hộp việc lên trước",
    prefs: {
      enabled: { stats: true, mywork: true, upcoming: false, inbox: true, aibrief: true },
      order: ["stats", "aibrief", "inbox", "mywork", "upcoming"],
      layout: "balanced",
      sizes: { stats: "full", aibrief: "lg", inbox: "sm", mywork: "lg", upcoming: "sm" },
    },
  },
  {
    key: "doer",
    label: "Người thực thi",
    description: "Ưu tiên việc cần làm và lịch sắp tới",
    prefs: {
      enabled: { stats: true, mywork: true, upcoming: true, inbox: true, aibrief: false },
      order: ["stats", "mywork", "upcoming", "inbox", "aibrief"],
      layout: "balanced",
      sizes: { stats: "full", mywork: "lg", upcoming: "sm", inbox: "sm", aibrief: "md" },
    },
  },
  {
    key: "minimal",
    label: "Tối giản",
    description: "Chỉ việc của tôi",
    prefs: {
      enabled: { stats: false, mywork: true, upcoming: false, inbox: false, aibrief: false },
      order: ["mywork", "stats", "upcoming", "inbox", "aibrief"],
      layout: "compact",
      sizes: { mywork: "full", stats: "full", upcoming: "md", inbox: "md", aibrief: "md" },
    },
  },
];

const LAYOUT_KEY = `${HOME_PREFIX}layout:`;
const SIZE_KEY = `${HOME_PREFIX}size:`;

function isHomeSectionKey(k: string): k is HomeSectionKey {
  return k in HOME_SECTION_META;
}

/** Đọc prefs Home từ payload chung của user_dashboard_prefs. */
export function readHomePrefs(
  sections: Record<string, boolean> | null,
  order: string[] | null,
): HomePrefs {
  const enabled = { ...DEFAULT_HOME_PREFS.enabled };
  const sizes = { ...DEFAULT_HOME_SIZES };
  let layout: HomeLayout = DEFAULT_HOME_PREFS.layout;

  for (const [k, v] of Object.entries(sections ?? {})) {
    if (k.startsWith(SIZE_KEY)) {
      const [section, size] = k.slice(SIZE_KEY.length).split(":");
      if (v && section && size && isHomeSectionKey(section) && isHomeSize(size)) {
        sizes[section] = size;
      }
      continue;
    }
    if (k.startsWith(LAYOUT_KEY)) {
      const l = k.slice(LAYOUT_KEY.length);
      if (v && (l === "compact" || l === "balanced" || l === "wide")) layout = l;
      continue;
    }
    if (!k.startsWith(HOME_PREFIX)) continue;
    const key = k.slice(HOME_PREFIX.length);
    if (isHomeSectionKey(key)) enabled[key] = v;
  }

  const fromOrder = (order ?? [])
    .filter((k) => k.startsWith(HOME_PREFIX))
    .map((k) => k.slice(HOME_PREFIX.length))
    .filter(isHomeSectionKey);
  const ordered: HomeSectionKey[] = [
    ...fromOrder,
    ...DEFAULT_HOME_ORDER.filter((k) => !fromOrder.includes(k)),
  ];

  return { enabled, order: ordered, layout, sizes };
}

/** Ghi prefs Home vào payload chung, giữ nguyên mọi khoá không thuộc Home. */
export function writeHomePrefs(
  prefs: HomePrefs,
  currentSections: Record<string, boolean> | null,
  currentOrder: string[] | null,
): { sections: Record<string, boolean>; order: string[] } {
  const sections: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(currentSections ?? {})) {
    if (!k.startsWith(HOME_PREFIX)) sections[k] = v;
  }
  for (const key of DEFAULT_HOME_ORDER) {
    sections[`${HOME_PREFIX}${key}`] = prefs.enabled[key];
  }
  for (const l of HOME_LAYOUTS) {
    sections[`${LAYOUT_KEY}${l.key}`] = prefs.layout === l.key;
  }
  for (const key of DEFAULT_HOME_ORDER) {
    for (const s of HOME_SIZES) {
      sections[`${SIZE_KEY}${key}:${s.key}`] = prefs.sizes[key] === s.key;
    }
  }

  const keptOrder = (currentOrder ?? []).filter((k) => !k.startsWith(HOME_PREFIX));
  const order = [...keptOrder, ...prefs.order.map((k) => `${HOME_PREFIX}${k}`)];
  return { sections, order };
}

export function moveSection(
  order: HomeSectionKey[],
  key: HomeSectionKey,
  dir: -1 | 1,
): HomeSectionKey[] {
  const idx = order.indexOf(key);
  const next = idx + dir;
  if (idx < 0 || next < 0 || next >= order.length) return order;
  const copy = [...order];
  [copy[idx], copy[next]] = [copy[next], copy[idx]];
  return copy;
}
