import { describe, expect, it } from "vitest";
import {
  INSTANT_MEETING_BACKDATE_MS,
  INSTANT_MEETING_CLOCK_SKEW_MS,
  INSTANT_MEETING_DEFAULT_DURATION_MINUTES,
  resolveInstantMeetingWindow,
} from "./meeting-instant";

const NOW = Date.parse("2026-09-20T10:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("resolveInstantMeetingWindow", () => {
  it("bắt đầu ngay: lùi giờ bắt đầu về quá khứ để vào phòng được luôn", () => {
    const res = resolveInstantMeetingWindow({ durationMinutes: 30 }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Date.parse(res.startAt)).toBe(NOW - INSTANT_MEETING_BACKDATE_MS);
    expect(Date.parse(res.endAt) - Date.parse(res.startAt)).toBe(30 * 60_000);
  });

  it("không truyền thời lượng thì dùng mặc định", () => {
    const res = resolveInstantMeetingWindow({}, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Date.parse(res.endAt) - Date.parse(res.startAt)).toBe(
      INSTANT_MEETING_DEFAULT_DURATION_MINUTES * 60_000,
    );
  });

  it("giữ nguyên mốc bắt đầu do người dùng chọn trong tương lai", () => {
    const startAt = at(15 * 60_000);
    const res = resolveInstantMeetingWindow({ startAt, durationMinutes: 45 }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.startAt).toBe(startAt);
    expect(Date.parse(res.endAt)).toBe(Date.parse(startAt) + 45 * 60_000);
  });

  it("từ chối mốc bắt đầu đã qua", () => {
    const res = resolveInstantMeetingWindow({ startAt: at(-24 * 3600_000) }, NOW);
    expect(res).toEqual({ ok: false, error: "START_IN_PAST" });
  });

  // Đồng hồ máy người dùng lệch vài phút là chuyện thường; chặn cả những lệch
  // đó thì "Bắt đầu ngay" của chính người dùng cũng bị từ chối.
  it("chấp nhận sai số đồng hồ trong biên cho phép", () => {
    const justInside = resolveInstantMeetingWindow(
      { startAt: at(-INSTANT_MEETING_CLOCK_SKEW_MS + 1000) },
      NOW,
    );
    expect(justInside.ok).toBe(true);

    const justOutside = resolveInstantMeetingWindow(
      { startAt: at(-INSTANT_MEETING_CLOCK_SKEW_MS - 1000) },
      NOW,
    );
    expect(justOutside).toEqual({ ok: false, error: "START_IN_PAST" });
  });

  it("từ chối chuỗi thời gian không đọc được", () => {
    expect(resolveInstantMeetingWindow({ startAt: "hôm qua" }, NOW)).toEqual({
      ok: false,
      error: "START_INVALID",
    });
  });

  it("từ chối thời lượng không dương (end phải sau start)", () => {
    expect(resolveInstantMeetingWindow({ durationMinutes: 0 }, NOW)).toEqual({
      ok: false,
      error: "START_INVALID",
    });
  });

  it("chuỗi rỗng được coi là bắt đầu ngay, không phải lỗi", () => {
    const res = resolveInstantMeetingWindow({ startAt: "", durationMinutes: 60 }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Date.parse(res.startAt)).toBe(NOW - INSTANT_MEETING_BACKDATE_MS);
  });
});
