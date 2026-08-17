/**
 * Ảnh được lưu trên CDN của Lovable dưới đường dẫn tương đối `/__l5e/...`.
 * Khi app chạy ngoài hạ tầng Lovable (self-host Docker, domain riêng), đường
 * dẫn tương đối này không tồn tại nên ảnh bị lỗi. Luôn trả về URL tuyệt đối
 * để hoạt động ở mọi môi trường và giữ SSR/CSR khớp nhau.
 */
const CDN_ORIGIN = "https://unidigiwork.lovable.app";

export function assetUrl(pointer: { url: string } | string): string {
  const url = typeof pointer === "string" ? pointer : pointer.url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${CDN_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}
