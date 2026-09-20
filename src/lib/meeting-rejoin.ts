// Quy tắc tự vào lại phòng họp sau khi rớt kết nối LiveKit.
// Tách khỏi component để kiểm thử được: quyết định "có thử lại không", "chờ bao
// lâu" và "báo lỗi gì" đều là hàm thuần, không phụ thuộc React hay LiveKit runtime.

/**
 * Mã lý do rớt phòng của LiveKit (`livekit.DisconnectReason`). Khai báo lại ở
 * đây thay vì `import { DisconnectReason } from "livekit-client"` để trang phòng
 * họp không phải tải cả SDK họp trước khi người dùng bấm vào phòng — SDK chỉ
 * được nạp trong `livekit-stage` qua `React.lazy`.
 * `meeting-rejoin.test.ts` đối chiếu các số này với enum thật để phát hiện lệch.
 */
export const DISCONNECT_REASON = {
  UNKNOWN_REASON: 0,
  CLIENT_INITIATED: 1,
  DUPLICATE_IDENTITY: 2,
  SERVER_SHUTDOWN: 3,
  PARTICIPANT_REMOVED: 4,
  ROOM_DELETED: 5,
  STATE_MISMATCH: 6,
  JOIN_FAILURE: 7,
  MIGRATION: 8,
  SIGNAL_CLOSE: 9,
  ROOM_CLOSED: 10,
  USER_UNAVAILABLE: 11,
  USER_REJECTED: 12,
  SIP_TRUNK_FAILURE: 13,
  CONNECTION_TIMEOUT: 14,
} as const;

/** Số lần tự vào lại trước khi bỏ cuộc và trả người dùng về màn hình chờ. */
export const MAX_REJOIN_ATTEMPTS = 5;

/**
 * Hết thời gian này mà LiveKit chưa báo `connected` thì coi lần thử là thất bại.
 * Cần thiết vì `Room.connect()` có thể hỏng mà không phát `Disconnected`
 * (ví dụ máy chủ họp không tồn tại nên WebSocket không bao giờ mở).
 */
export const REJOIN_CONNECT_TIMEOUT_MS = 20_000;

/**
 * Những lý do rớt phòng mà thử lại cũng vô ích — thử lại chỉ tạo vòng lặp.
 * `CLIENT_INITIATED` nằm đây vì đó là chính người dùng (hoặc app) chủ động rời.
 */
const FATAL_REASONS: ReadonlySet<number> = new Set<number>([
  DISCONNECT_REASON.CLIENT_INITIATED,
  DISCONNECT_REASON.DUPLICATE_IDENTITY,
  DISCONNECT_REASON.PARTICIPANT_REMOVED,
  DISCONNECT_REASON.ROOM_DELETED,
  DISCONNECT_REASON.ROOM_CLOSED,
  DISCONNECT_REASON.USER_REJECTED,
]);

/** Rớt vì lý do này thì KHÔNG được tự vào lại. */
export function isFatalDisconnect(reason?: number): boolean {
  return reason !== undefined && FATAL_REASONS.has(reason);
}

/** Backoff 1s → 2s → 4s → 8s → 15s (trần). `attempt` đếm từ 0 cho lần thử đầu. */
export function rejoinDelayMs(attempt: number): number {
  const safe = Math.max(0, Math.floor(attempt));
  return Math.min(1000 * 2 ** safe, 15_000);
}

/** Còn được phép thử lại lần nữa không (đã thử `attempt` lần trước đó). */
export function canRetry(attempt: number, reason?: number): boolean {
  return !isFatalDisconnect(reason) && attempt < MAX_REJOIN_ATTEMPTS;
}

export type DisconnectMessageKey =
  | "mtg.room.disconnect.duplicate"
  | "mtg.room.disconnect.removed"
  | "mtg.room.disconnect.roomClosed"
  | "mtg.room.disconnect.serverDown"
  | "mtg.room.disconnect.unknown";

/** Khóa i18n giải thích cho người dùng vì sao bị rớt phòng. */
export function disconnectReasonKey(reason?: number): DisconnectMessageKey {
  switch (reason) {
    case DISCONNECT_REASON.DUPLICATE_IDENTITY:
      return "mtg.room.disconnect.duplicate";
    case DISCONNECT_REASON.PARTICIPANT_REMOVED:
    case DISCONNECT_REASON.USER_REJECTED:
      return "mtg.room.disconnect.removed";
    case DISCONNECT_REASON.ROOM_DELETED:
    case DISCONNECT_REASON.ROOM_CLOSED:
    case DISCONNECT_REASON.SERVER_SHUTDOWN:
      return "mtg.room.disconnect.roomClosed";
    case DISCONNECT_REASON.JOIN_FAILURE:
    case DISCONNECT_REASON.SIGNAL_CLOSE:
    case DISCONNECT_REASON.CONNECTION_TIMEOUT:
      return "mtg.room.disconnect.serverDown";
    default:
      return "mtg.room.disconnect.unknown";
  }
}
