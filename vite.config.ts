// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";


export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Ngoài sandbox Lovable (ví dụ build Docker self-host) build ra Node server
  // để chạy được bằng `node dist/server/index.mjs`. Trong sandbox Lovable
  // preset luôn bị ép về cloudflare-module nên dòng này không ảnh hưởng preview.
  nitro: { preset: "node-server" },
  vite: {
    plugins: [
      // Chỉ sinh service worker cho bản build; không đăng ký tự động, không chạy ở dev.
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        devOptions: { enabled: false },
        filename: "sw.js",
        manifest: false,
        workbox: {
          globDirectory: ".output/public",
          globPatterns: ["assets/**/*.{js,css,woff2}"],
          // Gộp xử lý thông báo đẩy vào chính service worker của ứng dụng.
          importScripts: ["/sw-push.js"],
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigationPreload: true,
          runtimeCaching: [
            {
              // Trang luôn ưu tiên mạng, chỉ dùng bản đệm khi mất kết nối.
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
              handler: "NetworkFirst",
              options: {
                cacheName: "uniwork-pages",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/assets/"),
              handler: "CacheFirst",
              options: {
                cacheName: "uniwork-assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
    server: {
      host: true,
      allowedHosts: ["uniwork.demo.ubos.vn"],
    },
    preview: {
      host: true,
      allowedHosts: ["uniwork.demo.ubos.vn"],
    },
  },

});
