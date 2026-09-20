import { describe, expect, it } from "vitest";
import {
  matchesRoomFilters,
  pinnedRoomsForView,
  withoutPinned,
  type PinnableMeeting,
  type RoomFilters,
} from "./meeting-pinned";

const NOW = Date.parse("2026-09-20T10:00:00.000Z");
const WS = "11111111-1111-4111-8111-111111111111";

function meeting(over: Partial<PinnableMeeting> = {}): PinnableMeeting {
  return {
    id: "m-new",
    title: "Họp tổng kết Q3",
    status: "scheduled",
    start_at: "2026-09-25T02:00:00.000Z",
    end_at: "2026-09-25T03:00:00.000Z",
    workspace_id: WS,
    deleted_at: null,
    ...over,
  };
}

function filters(over: Partial<RoomFilters> = {}): RoomFilters {
  return { workspaceId: WS, search: "", state: "all", page: 1, ...over };
}

describe("matchesRoomFilters", () => {
  it("nhận cuộc họp sắp tới khi đang ở bộ lọc mặc định", () => {
    expect(matchesRoomFilters(meeting(), filters(), NOW)).toBe(true);
  });

  it("loại cuộc họp của workspace khác", () => {
    const other = meeting({ workspace_id: "22222222-2222-4222-8222-222222222222" });
    expect(matchesRoomFilters(other, filters(), NOW)).toBe(false);
  });

  it("loại cuộc họp đã xóa mềm", () => {
    expect(
      matchesRoomFilters(meeting({ deleted_at: "2026-09-20T09:00:00.000Z" }), filters(), NOW),
    ).toBe(false);
  });

  it("tôn trọng từ khóa tìm kiếm, không phân biệt hoa thường", () => {
    expect(matchesRoomFilters(meeting(), filters({ search: "tổng kết" }), NOW)).toBe(true);
    expect(matchesRoomFilters(meeting(), filters({ search: "sprint" }), NOW)).toBe(false);
  });

  it("bộ lọc mặc định chỉ giữ cuộc họp chưa kết thúc", () => {
    expect(matchesRoomFilters(meeting({ status: "canceled" }), filters(), NOW)).toBe(false);
    expect(matchesRoomFilters(meeting({ status: "ended" }), filters(), NOW)).toBe(false);
    expect(matchesRoomFilters(meeting({ status: "live" }), filters(), NOW)).toBe(true);
  });

  it("bộ lọc 'sắp diễn ra' loại cuộc họp đã qua giờ bắt đầu", () => {
    const past = meeting({
      start_at: "2026-09-19T02:00:00.000Z",
      end_at: "2026-09-19T03:00:00.000Z",
    });
    expect(matchesRoomFilters(meeting(), filters({ state: "upcoming" }), NOW)).toBe(true);
    expect(matchesRoomFilters(past, filters({ state: "upcoming" }), NOW)).toBe(false);
  });

  // Phòng họp nhanh được tạo với start_at lùi về quá khứ để vào được ngay, nên
  // nó rơi ra ngoài mọi bộ lọc trừ "tất cả" và "đang diễn ra". Trang /meeting
  // dựa vào đúng kết quả false này để gỡ bộ lọc, nếu không người dùng vừa bấm
  // tạo đã thấy danh sách trống và tưởng tạo hỏng.
  it("phòng họp nhanh vừa tạo không khớp bộ lọc 'sắp diễn ra'", () => {
    const instant = meeting({
      status: "scheduled",
      start_at: new Date(NOW - 60_000).toISOString(),
      end_at: new Date(NOW + 59 * 60_000).toISOString(),
    });
    expect(matchesRoomFilters(instant, filters({ state: "upcoming" }), NOW)).toBe(false);
    expect(matchesRoomFilters(instant, filters({ state: "all" }), NOW)).toBe(true);
  });

  it("bộ lọc 'đã kết thúc' chỉ nhận cuộc họp đã kết thúc hoặc bị hủy", () => {
    expect(
      matchesRoomFilters(meeting({ status: "canceled" }), filters({ state: "ended" }), NOW),
    ).toBe(true);
    expect(matchesRoomFilters(meeting(), filters({ state: "ended" }), NOW)).toBe(false);
  });

  it("bộ lọc 'đang diễn ra' chỉ nhận phòng đang live", () => {
    expect(matchesRoomFilters(meeting({ status: "live" }), filters({ state: "live" }), NOW)).toBe(
      true,
    );
    expect(matchesRoomFilters(meeting(), filters({ state: "live" }), NOW)).toBe(false);
  });

  it("tôn trọng khoảng ngày đang lọc (theo giờ địa phương của trình duyệt)", () => {
    const start = new Date("2026-09-25T02:00:00.000Z");
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const sameDay = ymd(start);
    const dayBefore = ymd(new Date(start.getTime() - 24 * 3600_000));

    expect(matchesRoomFilters(meeting(), filters({ from: sameDay, to: sameDay }), NOW)).toBe(true);
    expect(matchesRoomFilters(meeting(), filters({ from: dayBefore, to: dayBefore }), NOW)).toBe(
      false,
    );
  });
});

describe("pinnedRoomsForView", () => {
  it("đưa cuộc họp vừa tạo lên đầu trang 1", () => {
    expect(pinnedRoomsForView([meeting()], filters(), NOW).map((m) => m.id)).toEqual(["m-new"]);
  });

  it("không ghim khi người dùng đã sang trang khác", () => {
    expect(pinnedRoomsForView([meeting()], filters({ page: 2 }), NOW)).toEqual([]);
  });

  it("giữ thứ tự đã truyền vào và bỏ trùng id", () => {
    const a = meeting({ id: "a" });
    const b = meeting({ id: "b" });
    expect(pinnedRoomsForView([b, a, b], filters(), NOW).map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("bỏ qua bản ghi chưa tải xong", () => {
    expect(pinnedRoomsForView([undefined, meeting()], filters(), NOW).map((m) => m.id)).toEqual([
      "m-new",
    ]);
  });
});

describe("withoutPinned", () => {
  it("loại bản trùng khỏi danh sách server để không hiện hai dòng", () => {
    const rows = [{ id: "a" }, { id: "m-new" }, { id: "b" }];
    expect(withoutPinned(rows, [meeting()]).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("giữ nguyên danh sách khi không có gì được ghim", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(withoutPinned(rows, [])).toEqual(rows);
  });
});
