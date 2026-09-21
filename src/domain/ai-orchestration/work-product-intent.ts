// Nhận diện loại Kết quả công việc mà người dùng thực sự yêu cầu.
// Không đoán bừa: chỉ trả về loại khi yêu cầu có từ khoá rõ ràng.
export const WORK_PRODUCT_KINDS = ["REPORT", "PROPOSAL", "PRESENTATION", "SPREADSHEET"] as const;
export type WorkProductKind = (typeof WORK_PRODUCT_KINDS)[number];

const PATTERNS: Array<{ kind: WorkProductKind; re: RegExp }> = [
  { kind: "REPORT", re: /\b(bao cao|báo cáo|report|tong ket|tổng kết)\b/i },
  { kind: "PROPOSAL", re: /\b(de xuat|đề xuất|to trinh|tờ trình|proposal|kien nghi|kiến nghị)\b/i },
  {
    kind: "PRESENTATION",
    re: /\b(bai trinh bay|bài trình bày|trinh chieu|trình chiếu|thuyet trinh|thuyết trình|slide|slides|presentation|deck)\b/i,
  },
  {
    kind: "SPREADSHEET",
    re: /\b(bang tinh|bảng tính|spreadsheet|excel|bang theo doi|bảng theo dõi|bang du lieu|bảng dữ liệu)\b/i,
  },
];

/** Yêu cầu muốn dựng trọn bộ kết quả. */
const FULL_SET =
  /\b(tron bo|trọn bộ|ca bo|cả bộ|day du cac loai|đầy đủ các loại|tat ca cac loai|tất cả các loại|full set)\b/i;

/**
 * Trả về danh sách loại Work Product cần dựng thật cho một yêu cầu.
 * Rỗng = người dùng không yêu cầu kết quả công việc nào.
 */
export function detectWorkProductKinds(text: string): WorkProductKind[] {
  const value = (text ?? "").trim();
  if (!value) return [];
  if (FULL_SET.test(value)) return [...WORK_PRODUCT_KINDS];
  const kinds = PATTERNS.filter(({ re }) => re.test(value)).map(({ kind }) => kind);
  return [...new Set(kinds)];
}
