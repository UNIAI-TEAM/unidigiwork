// Nhận diện loại Kết quả công việc mà người dùng thực sự yêu cầu.
// Không đoán bừa: chỉ trả về loại khi yêu cầu có từ khoá rõ ràng.
export const WORK_PRODUCT_KINDS = ["REPORT", "PROPOSAL", "PRESENTATION", "SPREADSHEET"] as const;
export type WorkProductKind = (typeof WORK_PRODUCT_KINDS)[number];

const PATTERNS: Array<{ kind: WorkProductKind; re: RegExp }> = [
  { kind: "REPORT", re: /(bao cao|report|tong ket)/i },
  { kind: "PROPOSAL", re: /(de xuat|to trinh|proposal|kien nghi)/i },
  {
    kind: "PRESENTATION",
    re: /(bai trinh bay|trinh chieu|thuyet trinh|slide|presentation|deck)/i,
  },
  {
    kind: "SPREADSHEET",
    re: /(bang tinh|spreadsheet|excel|bang theo doi|bang du lieu)/i,
  },
];

/** Yêu cầu muốn dựng trọn bộ kết quả. */
const FULL_SET = /(tron bo|ca bo|day du cac loai|tat ca cac loai|full set)/i;

/** Bỏ dấu tiếng Việt để so khớp ổn định. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

/**
 * Trả về danh sách loại Work Product cần dựng thật cho một yêu cầu.
 * Rỗng = người dùng không yêu cầu kết quả công việc nào.
 */
export function detectWorkProductKinds(text: string): WorkProductKind[] {
  const value = normalize((text ?? "").trim());
  if (!value) return [];
  if (FULL_SET.test(value)) return [...WORK_PRODUCT_KINDS];
  const kinds = PATTERNS.filter(({ re }) => re.test(value)).map(({ kind }) => kind);
  return [...new Set(kinds)];
}
