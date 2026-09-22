import { createFileRoute } from "@tanstack/react-router";

import { APP_WEB_VERSION, MIN_NATIVE_VERSION } from "@/lib/app-version";

/**
 * Health-check công khai cho vỏ app native và cho web.
 * Vỏ app gọi endpoint này TRƯỚC khi nạp bản web từ xa:
 *  - không gọi được  -> hiện màn hình dự phòng (Retry / chẩn đoán mạng)
 *  - killSwitch true -> chặn bootstrap, hiện thông báo bảo trì
 *  - nativeVersion < minNativeVersion -> yêu cầu cập nhật bản cài
 */
function payload() {
  const killSwitch = process.env["UNIWORK_KILL_SWITCH"] === "true";
  return {
    ok: !killSwitch,
    service: "uniwork-web",
    webVersion: APP_WEB_VERSION,
    minNativeVersion: process.env["UNIWORK_MIN_NATIVE_VERSION"] ?? MIN_NATIVE_VERSION,
    killSwitch,
    message: killSwitch
      ? (process.env["UNIWORK_KILL_MESSAGE"] ??
        "UniWork đang bảo trì. Vui lòng thử lại sau ít phút.")
      : null,
    serverTime: new Date().toISOString(),
  };
}

export const Route = createFileRoute("/api/public/app-health")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(payload()), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
          },
        }),
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,OPTIONS",
          },
        }),
    },
  },
});
