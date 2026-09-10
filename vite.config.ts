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
