import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Bản app nội bộ (không phát hành lên kho ứng dụng).
 * App nạp trực tiếp bản đã publish của UniWork, nên mọi thay đổi code
 * chỉ cần publish lại — không phải dựng lại file cài.
 */
const config: CapacitorConfig = {
  appId: "vn.ubos.uniwork",
  appName: "UniWork",
  // Không build tĩnh: app trỏ tới bản web đã publish. webDir chỉ là fallback.
  webDir: "public",
  server: {
    url: process.env["CAPACITOR_SERVER_URL"] ?? "https://unidigiwork.lovable.app",
    cleartext: false,
    androidScheme: "https",
    // Cho phép điều hướng ra ngoài khi đăng nhập bằng nhà cung cấp khác.
    allowNavigation: ["unidigiwork.lovable.app", "*.lovable.app", "*.supabase.co"],
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#0B0D12",
      showSpinner: false,
    },
  },
};

export default config;
