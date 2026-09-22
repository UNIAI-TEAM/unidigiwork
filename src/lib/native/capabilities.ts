/**
 * Contract giữa web và vỏ app native: `window.UniWorkNative`.
 * Web LUÔN hỏi shell hỗ trợ gì rồi mới dùng, thay vì giả định có API native.
 */

export const NATIVE_CAPABILITIES = [
  "push", // thông báo đẩy native (FCM/APNs)
  "network", // sự kiện mạng từ hệ điều hành
  "backButton", // nút Back Android
  "statusBar",
  "splashScreen",
  "camera",
  "filesystem",
  "biometrics",
  "share",
] as const;

export type NativeCapability = (typeof NATIVE_CAPABILITIES)[number];

export type UniWorkNativeBridge = {
  /** Phiên bản contract; tăng khi đổi hình dạng bridge. */
  contractVersion: number;
  /** Phiên bản binary đã cài (từ App.getInfo). */
  nativeVersion: string;
  platform: "ios" | "android" | "web";
  capabilities: NativeCapability[];
  has: (cap: NativeCapability) => boolean;
};

declare global {
  interface Window {
    UniWorkNative?: UniWorkNativeBridge;
  }
}

export const NATIVE_CONTRACT_VERSION = 1;

export function nativeBridge(): UniWorkNativeBridge | null {
  if (typeof window === "undefined") return null;
  return window.UniWorkNative ?? null;
}

/** Web hỏi trước khi dùng; không có shell hoặc binary cũ -> false, web tự fallback. */
export function hasNativeCapability(cap: NativeCapability): boolean {
  return nativeBridge()?.has(cap) ?? false;
}

export function installNativeBridge(input: {
  nativeVersion: string;
  platform: "ios" | "android" | "web";
  capabilities: NativeCapability[];
}): UniWorkNativeBridge {
  const caps = [...new Set(input.capabilities)];
  const bridge: UniWorkNativeBridge = {
    contractVersion: NATIVE_CONTRACT_VERSION,
    nativeVersion: input.nativeVersion,
    platform: input.platform,
    capabilities: caps,
    has: (cap) => caps.includes(cap),
  };
  if (typeof window !== "undefined") window.UniWorkNative = bridge;
  return bridge;
}
