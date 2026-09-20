// Cửa sổ thời gian của "Bắt đầu họp ngay".
//
// Dùng chung giữa server fn `createInstantMeeting` và hộp thoại tạo phòng ở
// /meeting: client báo lỗi ngay tại form thay vì bắn một request chắc chắn bị
// từ chối, còn server vẫn là nơi quyết định cuối cùng. Tách ra một hàm thuần để
// hai phía không bao giờ lệch luật với nhau và để kiểm thử được.

/** Phòng họp nhanh lùi giờ bắt đầu về quá khứ một chút để vào được ngay. */
export const INSTANT_MEETING_BACKDATE_MS = 60_000;

/**
 * Đồng hồ máy người dùng lệch vài phút so với server là chuyện thường, nên mốc
 * "đã qua" phải có biên. Lệch xa hơn biên này thì đúng là chọn nhầm ngày, chứ
 * không phải sai số đồng hồ.
 */
export const INSTANT_MEETING_CLOCK_SKEW_MS = 5 * 60_000;

export const INSTANT_MEETING_DEFAULT_DURATION_MINUTES = 60;

export type InstantMeetingWindowError = "START_INVALID" | "START_IN_PAST";

export type InstantMeetingWindowResult =
  | { ok: true; startAt: string; endAt: string }
  | { ok: false; error: InstantMeetingWindowError };

/**
 * `startAt` bỏ trống = bắt đầu ngay: giờ bắt đầu lùi lại {@link INSTANT_MEETING_BACKDATE_MS}
 * để cuộc họp đã nằm trong khung giờ diễn ra, vào phòng được luôn mà không cần
 * bấm "Bắt đầu họp" trước.
 */
export function resolveInstantMeetingWindow(
  input: { startAt?: string | undefined; durationMinutes?: number | undefined },
  now: number = Date.now(),
): InstantMeetingWindowResult {
  const minutes = input.durationMinutes ?? INSTANT_MEETING_DEFAULT_DURATION_MINUTES;
  const durationMs = minutes * 60_000;

  if (input.startAt === undefined || input.startAt === "") {
    const start = now - INSTANT_MEETING_BACKDATE_MS;
    return window(start, durationMs);
  }

  const start = new Date(input.startAt).getTime();
  if (Number.isNaN(start)) return { ok: false, error: "START_INVALID" };
  if (start < now - INSTANT_MEETING_CLOCK_SKEW_MS) return { ok: false, error: "START_IN_PAST" };
  return window(start, durationMs);
}

function window(start: number, durationMs: number): InstantMeetingWindowResult {
  // Thời lượng không dương thì end <= start, RPC sẽ ném MEETING_TIME_INVALID —
  // chặn sớm ở đây để thông điệp lỗi đúng chỗ người dùng đang thao tác.
  if (!(durationMs > 0)) return { ok: false, error: "START_INVALID" };
  return {
    ok: true,
    startAt: new Date(start).toISOString(),
    endAt: new Date(start + durationMs).toISOString(),
  };
}
