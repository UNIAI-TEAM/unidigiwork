import { describe, expect, it } from "vitest";
import {
  GUEST_NAME_MAX,
  guestIdentity,
  guestNameError,
  guestRedeemMessage,
  guestSessionKey,
  isGuestIdentity,
  isGuestLinkUsable,
  normalizeGuestName,
} from "./meeting-guest";

describe("normalizeGuestName", () => {
  it("gộp khoảng trắng thừa và cắt hai đầu", () => {
    expect(normalizeGuestName("  Nguyễn   Văn  A  ")).toBe("Nguyễn Văn A");
  });

  it("gộp cả xuống dòng và tab", () => {
    expect(normalizeGuestName("Trần\tThị\nB")).toBe("Trần Thị B");
  });
});

describe("guestNameError", () => {
  it("nhận tên bình thường", () => {
    expect(guestNameError("Minh")).toBeNull();
  });

  it("từ chối tên quá ngắn, tính theo bản đã gộp khoảng trắng", () => {
    expect(guestNameError("")).toBe("too_short");
    expect(guestNameError("     ")).toBe("too_short");
    expect(guestNameError("A")).toBe("too_short");
  });

  it("từ chối tên quá dài", () => {
    expect(guestNameError("x".repeat(GUEST_NAME_MAX))).toBeNull();
    expect(guestNameError("x".repeat(GUEST_NAME_MAX + 1))).toBe("too_long");
  });
});

describe("guestRedeemMessage", () => {
  it("vào được thì không có thông điệp lỗi", () => {
    expect(guestRedeemMessage("joined")).toBeNull();
    expect(isGuestLinkUsable("joined")).toBe(true);
  });

  // Nếu tách riêng thông điệp cho `guests_not_allowed`, người dò link biết được
  // link đó có thật — đủ để khẳng định tổ chức này đang có cuộc họp nào đó.
  it("giấu 'link nội bộ' sau cùng một thông điệp với 'link không tồn tại'", () => {
    expect(guestRedeemMessage("guests_not_allowed")).toBe("invalid");
    expect(guestRedeemMessage("invalid")).toBe("invalid");
    expect(isGuestLinkUsable("guests_not_allowed")).toBe(false);
  });

  it("giữ nguyên các lý do được phép nói thẳng", () => {
    expect(guestRedeemMessage("expired")).toBe("expired");
    expect(guestRedeemMessage("exhausted")).toBe("exhausted");
    expect(guestRedeemMessage("revoked")).toBe("revoked");
    expect(guestRedeemMessage("not_joinable")).toBe("not_joinable");
    expect(guestRedeemMessage("invalid_name")).toBe("invalid_name");
  });
});

describe("danh tính khách", () => {
  it("gắn tiền tố để không lẫn với uuid người nội bộ", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(guestIdentity(id)).toBe(`guest:${id}`);
    expect(isGuestIdentity(guestIdentity(id))).toBe(true);
    expect(isGuestIdentity(id)).toBe(false);
  });

  it("khoá phiên tách theo từng cuộc họp", () => {
    expect(guestSessionKey("a")).not.toBe(guestSessionKey("b"));
    expect(guestSessionKey("a")).toContain("a");
  });
});
