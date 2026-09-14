// Tuỳ biến bố cục CEO Command Center: thứ tự và kích thước từng khối.
// Dùng chung bảng user_dashboard_prefs, phân biệt bằng tiền tố "ceo.".

export const CEO_PREFIX = "ceo.";

export type CeoSectionKey =
  | "attention"
  | "totals"
  | "standup"
  | "import"
  | "analytics"
  | "people"
  | "departments"
  | "kpisettings"
  | "economics"
  | "proposals"
  | "questions";

export type CeoSize = "sm" | "md" | "lg" | "full";

export const CEO_SIZES: { key: CeoSize; label: string; span: number }[] = [
  { key: "sm", label: "Nhỏ", span: 4 },
  { key: "md", label: "Vừa", span: 6 },
  { key: "lg", label: "Lớn", span: 8 },
  { key: "full", label: "Toàn hàng", span: 12 },
];

export const CEO_SECTION_LABEL: Record<CeoSectionKey, string> = {
  attention: "Cần chú ý",
  totals: "Chỉ số công việc",
  standup: "Giao ban thực tế",
  import: "Nhập dữ liệu Excel",
  analytics: "Người ↔ AI, thời gian, chất lượng",
  people: "Thời gian làm việc từng nhân sự",
  departments: "Bộ phận và vấn đề",
  kpisettings: "KPI mục tiêu",
  economics: "Chỉ số đề xuất",
  proposals: "Nhật ký đề xuất giao việc",
  questions: "Bốn câu hỏi của CEO",
};

export const DEFAULT_CEO_ORDER: CeoSectionKey[] = [
  "attention",
  "totals",
  "standup",
  "import",
  "analytics",
  "people",
  "departments",
  "kpisettings",
  "economics",
  "proposals",
  "questions",
];

export const DEFAULT_CEO_SIZES: Record<CeoSectionKey, CeoSize> = {
  attention: "full",
  totals: "full",
  standup: "full",
  import: "full",
  analytics: "full",
  people: "full",
  departments: "full",
  kpisettings: "full",
  economics: "full",
  proposals: "full",
  questions: "full",
};

export type CeoLayoutPrefs = {
  order: CeoSectionKey[];
  sizes: Record<CeoSectionKey, CeoSize>;
};

export const DEFAULT_CEO_PREFS: CeoLayoutPrefs = {
  order: DEFAULT_CEO_ORDER,
  sizes: DEFAULT_CEO_SIZES,
};

const SIZE_KEY = `${CEO_PREFIX}size:`;

export function isCeoSize(v: string): v is CeoSize {
  return v === "sm" || v === "md" || v === "lg" || v === "full";
}

function isCeoSectionKey(k: string): k is CeoSectionKey {
  return (DEFAULT_CEO_ORDER as string[]).includes(k);
}

export function ceoSpan(size: CeoSize): number {
  return CEO_SIZES.find((s) => s.key === size)?.span ?? 12;
}

/** Đọc bố cục CEO từ payload chung của user_dashboard_prefs. */
export function readCeoPrefs(
  sections: Record<string, boolean> | null,
  order: string[] | null,
): CeoLayoutPrefs {
  const sizes = { ...DEFAULT_CEO_SIZES };
  for (const [k, v] of Object.entries(sections ?? {})) {
    if (!k.startsWith(SIZE_KEY) || !v) continue;
    const [section, size] = k.slice(SIZE_KEY.length).split(":");
    if (section && size && isCeoSectionKey(section) && isCeoSize(size)) sizes[section] = size;
  }
  const fromOrder = (order ?? [])
    .filter((k) => k.startsWith(CEO_PREFIX) && !k.startsWith(SIZE_KEY))
    .map((k) => k.slice(CEO_PREFIX.length))
    .filter(isCeoSectionKey);
  const ordered: CeoSectionKey[] = [
    ...fromOrder,
    ...DEFAULT_CEO_ORDER.filter((k) => !fromOrder.includes(k)),
  ];
  return { order: ordered, sizes };
}

/** Ghi bố cục CEO vào payload chung, giữ nguyên các khoá của màn khác. */
export function writeCeoPrefs(
  prefs: CeoLayoutPrefs,
  currentSections: Record<string, boolean> | null,
  currentOrder: string[] | null,
): { sections: Record<string, boolean>; order: string[] } {
  const sections: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(currentSections ?? {})) {
    if (!k.startsWith(CEO_PREFIX)) sections[k] = v;
  }
  for (const key of DEFAULT_CEO_ORDER) {
    for (const s of CEO_SIZES) {
      sections[`${SIZE_KEY}${key}:${s.key}`] = prefs.sizes[key] === s.key;
    }
  }
  const keptOrder = (currentOrder ?? []).filter((k) => !k.startsWith(CEO_PREFIX));
  const order = [...keptOrder, ...prefs.order.map((k) => `${CEO_PREFIX}${k}`)];
  return { sections, order };
}

export function moveCeoSection(
  order: CeoSectionKey[],
  from: CeoSectionKey,
  to: CeoSectionKey,
): CeoSectionKey[] {
  const i = order.indexOf(from);
  const j = order.indexOf(to);
  if (i < 0 || j < 0 || i === j) return order;
  const copy = [...order];
  const [moved] = copy.splice(i, 1);
  copy.splice(j, 0, moved);
  return copy;
}
