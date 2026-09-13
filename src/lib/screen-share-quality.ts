// Cấu hình độ phân giải/khung hình cho luồng chia sẻ màn hình.
// Dùng chung giữa màn hình chờ (getDisplayMedia) và LiveKit stage.

export type ShareQualityKey = "auto" | "high" | "balanced" | "text";

export interface ShareQualityPreset {
  key: Exclude<ShareQualityKey, "auto">;
  label: string;
  hint: string;
  width: number;
  height: number;
  frameRate: number;
  /** Bitrate tối đa khi publish lên LiveKit (bps). */
  maxBitrate: number;
  contentHint: "motion" | "detail" | "text";
}

export const SHARE_QUALITY_PRESETS: Record<Exclude<ShareQualityKey, "auto">, ShareQualityPreset> = {
  high: {
    key: "high",
    label: "Nét cao (1080p · 30fps)",
    hint: "Ưu tiên hình ảnh, cần mạng khỏe",
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 3_000_000,
    contentHint: "motion",
  },
  balanced: {
    key: "balanced",
    label: "Cân bằng (720p · 15fps)",
    hint: "Mượt và tiết kiệm băng thông",
    width: 1280,
    height: 720,
    frameRate: 15,
    maxBitrate: 1_200_000,
    contentHint: "detail",
  },
  text: {
    key: "text",
    label: "Tiết kiệm (540p · 5fps)",
    hint: "Hợp cho slide, tài liệu, mạng yếu",
    width: 960,
    height: 540,
    frameRate: 5,
    maxBitrate: 500_000,
    contentHint: "text",
  },
};

export const SHARE_QUALITY_LABELS: Record<ShareQualityKey, string> = {
  auto: "Tự động theo mạng",
  high: SHARE_QUALITY_PRESETS.high.label,
  balanced: SHARE_QUALITY_PRESETS.balanced.label,
  text: SHARE_QUALITY_PRESETS.text.label,
};

const ORDER: Array<Exclude<ShareQualityKey, "auto">> = ["high", "balanced", "text"];

/** Hạ một bậc chất lượng khi mạng yếu. */
export function degrade(key: Exclude<ShareQualityKey, "auto">): Exclude<ShareQualityKey, "auto"> {
  const i = ORDER.indexOf(key);
  return ORDER[Math.min(i + 1, ORDER.length - 1)];
}

/** Nâng một bậc khi mạng hồi phục. */
export function upgrade(key: Exclude<ShareQualityKey, "auto">): Exclude<ShareQualityKey, "auto"> {
  const i = ORDER.indexOf(key);
  return ORDER[Math.max(i - 1, 0)];
}

/** Đoán chất lượng khởi điểm từ thông tin mạng của trình duyệt. */
export function detectPreset(): ShareQualityPreset {
  if (typeof navigator === "undefined") return SHARE_QUALITY_PRESETS.balanced;
  const conn = (
    navigator as unknown as {
      connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
    }
  ).connection;
  if (!conn) return SHARE_QUALITY_PRESETS.balanced;
  if (conn.saveData) return SHARE_QUALITY_PRESETS.text;
  const et = conn.effectiveType ?? "";
  if (et === "slow-2g" || et === "2g" || et === "3g") return SHARE_QUALITY_PRESETS.text;
  if ((conn.downlink ?? 0) >= 5) return SHARE_QUALITY_PRESETS.high;
  return SHARE_QUALITY_PRESETS.balanced;
}

export function resolvePreset(key: ShareQualityKey): ShareQualityPreset {
  return key === "auto" ? detectPreset() : SHARE_QUALITY_PRESETS[key];
}

/** Nguồn chia sẻ ưu tiên khi mở hộp thoại chọn của trình duyệt. */
export type ShareSourceKey = "any" | "monitor" | "window" | "browser";

export const SHARE_SOURCE_LABELS: Record<ShareSourceKey, string> = {
  any: "Để tôi chọn khi bấm",
  monitor: "Toàn màn hình",
  window: "Một cửa sổ ứng dụng",
  browser: "Một tab trình duyệt",
};

export const SHARE_SOURCE_STORAGE_KEY = "uniwork.meeting.shareSource";

export function displayMediaConstraints(
  p: ShareQualityPreset,
  source: ShareSourceKey = "any",
): MediaStreamConstraints {
  const video: MediaTrackConstraints & { displaySurface?: string } = {
    width: { ideal: p.width, max: p.width },
    height: { ideal: p.height, max: p.height },
    frameRate: { ideal: p.frameRate, max: p.frameRate },
  };
  // displaySurface là gợi ý: trình duyệt sẽ mở đúng nhóm nguồn tương ứng.
  if (source !== "any") video.displaySurface = source;
  return { video, audio: source === "browser" };
}

/** Đọc nguồn thật mà người dùng đã chọn trong hộp thoại. */
export function readTrackSurface(track: MediaStreamTrack | undefined): ShareSourceKey | null {
  const s = (track?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface;
  return s === "monitor" || s === "window" || s === "browser" ? s : null;
}

/** Áp cấu hình mới cho track màn hình đang chạy (không cần chọn lại màn hình). */
export async function applyPresetToTrack(
  track: MediaStreamTrack | undefined,
  p: ShareQualityPreset,
) {
  if (!track) return;
  try {
    (track as MediaStreamTrack & { contentHint: string }).contentHint = p.contentHint;
    await track.applyConstraints({
      width: { ideal: p.width, max: p.width },
      height: { ideal: p.height, max: p.height },
      frameRate: { ideal: p.frameRate, max: p.frameRate },
    });
  } catch {
    /* trình duyệt không hỗ trợ đổi nóng — bỏ qua, giữ nguyên track */
  }
}

export const SHARE_QUALITY_STORAGE_KEY = "uniwork.meeting.shareQuality";

export type DisplayMediaErrorCode =
  | "denied"
  | "cancelled"
  | "notFound"
  | "notReadable"
  | "unsupported"
  | "unknown";

/**
 * Diễn giải lỗi getDisplayMedia thành thông báo + hướng dẫn khắc phục cho người dùng.
 * `code` ổn định để UI tra chuỗi dịch; `title`/`hint` là bản tiếng Việt mặc định.
 */
export function describeDisplayMediaError(e: unknown): {
  code: DisplayMediaErrorCode;
  title: string;
  hint: string;
  cancelled: boolean;
} {
  const name = e instanceof DOMException || e instanceof Error ? e.name : "Error";
  switch (name) {
    case "NotAllowedError":
      return {
        code: "denied",
        title: "Bạn đã từ chối quyền chia sẻ màn hình",
        hint: 'Bấm biểu tượng ổ khóa trên thanh địa chỉ → cho phép "Chia sẻ màn hình", hoặc bấm lại nút và chọn một cửa sổ/tab trong hộp thoại.',
        cancelled: false,
      };
    case "AbortError":
      return {
        code: "cancelled",
        title: "Đã hủy chia sẻ màn hình",
        hint: "Bấm lại nút chia sẻ và chọn màn hình, cửa sổ hoặc tab muốn hiển thị.",
        cancelled: true,
      };
    case "NotFoundError":
      return {
        code: "notFound",
        title: "Không tìm thấy nguồn để chia sẻ",
        hint: "Hãy mở sẵn cửa sổ hoặc tab cần chia sẻ rồi thử lại.",
        cancelled: false,
      };
    case "NotReadableError":
      return {
        code: "notReadable",
        title: "Không đọc được nội dung màn hình",
        hint: "Một ứng dụng khác có thể đang chiếm quyền ghi màn hình. Đóng ứng dụng đó rồi thử lại.",
        cancelled: false,
      };
    case "NotSupportedError":
    case "TypeError":
      return {
        code: "unsupported",
        title: "Thiết bị hoặc trình duyệt không hỗ trợ chia sẻ màn hình",
        hint: "Trên iOS/Android, chia sẻ màn hình chưa được hỗ trợ. Hãy dùng Chrome, Edge hoặc Safari trên máy tính.",
        cancelled: false,
      };
    default:
      return {
        code: "unknown",
        title: "Không chia sẻ được màn hình",
        hint: "Kiểm tra quyền chia sẻ màn hình của trình duyệt (macOS: Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Ghi màn hình) rồi thử lại.",
        cancelled: false,
      };
  }
}
