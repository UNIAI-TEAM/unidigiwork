import { describe, expect, it } from "vitest";
import { DisconnectReason } from "livekit-client";
import {
  DISCONNECT_REASON,
  MAX_REJOIN_ATTEMPTS,
  canRetry,
  disconnectReasonKey,
  isFatalDisconnect,
  rejoinDelayMs,
} from "./meeting-rejoin";

describe("DISCONNECT_REASON", () => {
  it("khớp với enum thật của LiveKit (phát hiện lệch khi nâng SDK)", () => {
    for (const [name, value] of Object.entries(DISCONNECT_REASON)) {
      expect(value, name).toBe(DisconnectReason[name as keyof typeof DisconnectReason]);
    }
  });
});

describe("isFatalDisconnect", () => {
  it("không thử lại khi bị trùng danh tính (tab/thiết bị khác đã vào)", () => {
    expect(isFatalDisconnect(DISCONNECT_REASON.DUPLICATE_IDENTITY)).toBe(true);
  });

  it("không thử lại khi bị mời ra hoặc phòng đã đóng", () => {
    expect(isFatalDisconnect(DISCONNECT_REASON.PARTICIPANT_REMOVED)).toBe(true);
    expect(isFatalDisconnect(DISCONNECT_REASON.ROOM_DELETED)).toBe(true);
    expect(isFatalDisconnect(DISCONNECT_REASON.ROOM_CLOSED)).toBe(true);
  });

  it("không thử lại khi chính người dùng rời phòng", () => {
    expect(isFatalDisconnect(DISCONNECT_REASON.CLIENT_INITIATED)).toBe(true);
  });

  it("vẫn thử lại khi mất tín hiệu hoặc máy chủ không phản hồi", () => {
    expect(isFatalDisconnect(DISCONNECT_REASON.SIGNAL_CLOSE)).toBe(false);
    expect(isFatalDisconnect(DISCONNECT_REASON.JOIN_FAILURE)).toBe(false);
    expect(isFatalDisconnect(DISCONNECT_REASON.CONNECTION_TIMEOUT)).toBe(false);
    expect(isFatalDisconnect(undefined)).toBe(false);
  });
});

describe("rejoinDelayMs", () => {
  it("tăng gấp đôi rồi chặn trần ở 15s", () => {
    expect(rejoinDelayMs(0)).toBe(1000);
    expect(rejoinDelayMs(1)).toBe(2000);
    expect(rejoinDelayMs(2)).toBe(4000);
    expect(rejoinDelayMs(3)).toBe(8000);
    expect(rejoinDelayMs(4)).toBe(15_000);
    expect(rejoinDelayMs(50)).toBe(15_000);
  });
});

describe("canRetry", () => {
  it("dừng hẳn sau MAX_REJOIN_ATTEMPTS lần — không bao giờ lặp vô hạn", () => {
    expect(canRetry(MAX_REJOIN_ATTEMPTS - 1)).toBe(true);
    expect(canRetry(MAX_REJOIN_ATTEMPTS)).toBe(false);
    expect(canRetry(MAX_REJOIN_ATTEMPTS + 1)).toBe(false);
  });

  it("dừng ngay ở lý do không thể phục hồi, dù còn lượt", () => {
    expect(canRetry(0, DISCONNECT_REASON.DUPLICATE_IDENTITY)).toBe(false);
  });

  it("máy chủ họp chết vẫn chỉ được thử đúng số lượt cho phép", () => {
    // Hồi quy: trước đây mỗi lần xin được token lại reset bộ đếm về 0 nên
    // vòng lặp chạy mãi và spam toast "Đã tự động vào lại phòng họp".
    let attempt = 0;
    while (canRetry(attempt, DISCONNECT_REASON.JOIN_FAILURE)) attempt += 1;
    expect(attempt).toBe(MAX_REJOIN_ATTEMPTS);
  });
});

describe("disconnectReasonKey", () => {
  it("nêu đúng lý do cho người dùng", () => {
    expect(disconnectReasonKey(DISCONNECT_REASON.DUPLICATE_IDENTITY)).toBe(
      "mtg.room.disconnect.duplicate",
    );
    expect(disconnectReasonKey(DISCONNECT_REASON.PARTICIPANT_REMOVED)).toBe(
      "mtg.room.disconnect.removed",
    );
    expect(disconnectReasonKey(DISCONNECT_REASON.ROOM_CLOSED)).toBe(
      "mtg.room.disconnect.roomClosed",
    );
    expect(disconnectReasonKey(DISCONNECT_REASON.JOIN_FAILURE)).toBe(
      "mtg.room.disconnect.serverDown",
    );
    expect(disconnectReasonKey(undefined)).toBe("mtg.room.disconnect.unknown");
  });
});
