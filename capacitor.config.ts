import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Bản app nội bộ (không phát hành lên kho ứng dụng).
 * App KHÔNG bootstrap thẳng vào bản web từ xa nữa: nó mở màn hình bootstrap
 * cục bộ (`native-shell/index.html`) để health-check, kiểm tra kill-switch và
 * phiên bản tối thiểu, rồi mới chuyển sang bản web đã publish.
 * Đặt CAPACITOR_SERVER_URL khi cần trỏ thẳng remote (dev).
 */
const remoteOverride = process.env["CAPACITOR_SERVER_URL"];

const config: CapacitorConfig = {
  appId: "vn.ubos.uniwork",
  appName: "UniWork",
  // Màn hình bootstrap/dự phòng nằm trong binary.
  webDir: "native-shell",
  server: {
    ...(remoteOverride ? { url: remoteOverride } : {}),
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
