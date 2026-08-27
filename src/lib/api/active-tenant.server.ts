import { getCookie } from "@tanstack/react-start/server";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";

/** Đọc tổ chức đang hoạt động từ cookie (chỉ chạy phía máy chủ). */
export function readActiveTenantCookie(): string | null {
  return getCookie(ACTIVE_TENANT_COOKIE) ?? null;
}
