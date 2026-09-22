/**
 * Phiên bản gói web. Máy chủ và gói trình duyệt cùng đọc hằng số này,
 * nên khi bản mới lên sóng, máy đang chạy gói cũ sẽ phát hiện lệch và tự làm mới.
 * Tăng số này mỗi khi phát hành thay đổi phá vỡ tương thích với vỏ app.
 */
export const APP_WEB_VERSION = "2026.09.22-1";

/** Phiên bản vỏ app tối thiểu được phép dùng bản web hiện tại. */
export const MIN_NATIVE_VERSION = "1.0.0";

/** So sánh chuỗi phiên bản dạng x.y.z (bỏ hậu tố). */
export function compareVersions(a: string, b: string): number {
  const norm = (v: string) =>
    v
      .split(/[-+]/)[0]!
      .split(".")
      .map((p) => Number.parseInt(p, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
