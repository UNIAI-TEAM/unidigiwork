// Giả định mà `LiveKitStage` dựa vào khi quyết định có mở kết nối hay không:
// prop `connect` chỉ bật khi đã có vé vào phòng. Nếu nâng livekit-client làm
// giả định này sai, người dùng chưa bấm "Vào phòng" sẽ nhận sự kiện
// `disconnected` ngay lúc mở trang và bị tự động kéo vào phòng họp.
import { describe, expect, it } from "vitest";
import { Room } from "livekit-client";

describe("giả định của LiveKitStage về livekit-client", () => {
  it("disconnect() trên Room chưa từng kết nối không phát sự kiện `disconnected`", async () => {
    const room = new Room();
    let fired = 0;
    room.on("disconnected", () => {
      fired += 1;
    });
    await room.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fired).toBe(0);
  });
});
