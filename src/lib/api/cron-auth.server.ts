/**
 * Gate 1/24 — xác thực caller cho các endpoint nền (`/api/public/hooks/*`).
 *
 * Khoá anon/publishable nằm sẵn trong bundle trình duyệt nên KHÔNG phải bí mật.
 * Mọi job nền phải gửi `x-cron-secret` khớp `CRON_SECRET` (chỉ tồn tại phía máy chủ).
 * Không có secret cấu hình => từ chối (fail-closed), không bao giờ mở cửa mặc định.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = process.env["CRON_SECRET"];
  if (!expected) return false;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return provided.length > 0 && timingSafeEqual(provided, expected);
}

export function cronUnauthorizedResponse(): Response {
  return new Response("Unauthorized", { status: 401 });
}
