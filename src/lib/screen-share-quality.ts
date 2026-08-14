// Cấu hình độ phân giải/khung hình cho luồng chia sẻ màn hình.
// Dùng chung giữa màn hình chờ (getDisplayMedia) và LiveKit stage.

export type ShareQualityKey = "auto" | "high" | "balanced" | "text";

export interface ShareQualityPreset {
  key: ShareQualityKey;
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
  const conn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; saveData?: boolean } })
    .connection;
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

export function displayMediaConstraints(p: ShareQualityPreset): MediaStreamConstraints {
  return {
    video: {
      width: { ideal: p.width, max: p.width },
      height: { ideal: p.height, max: p.height },
      frameRate: { ideal: p.frameRate, max: p.frameRate },
    },
    audio: false,
  };
}

/** Áp cấu hình mới cho track màn hình đang chạy (không cần chọn lại màn hình). */
export async function applyPresetToTrack(track: MediaStreamTrack | undefined, p: ShareQualityPreset) {
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
