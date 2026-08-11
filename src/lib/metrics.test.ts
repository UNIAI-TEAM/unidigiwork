import { describe, expect, it } from "vitest";
import {
  isMeetingOnDay,
  isOverdueTask,
  isPendingWorkflowApproval,
  isStaleDocument,
  localDayKey,
} from "./metrics";

const now = new Date("2026-08-11T10:00:00Z");

describe("isOverdueTask", () => {
  it("đếm task quá hạn chưa kết thúc", () => {
    expect(isOverdueTask({ due_at: "2026-08-10T00:00:00Z", status: "todo" }, now)).toBe(true);
    expect(isOverdueTask({ due_at: "2026-08-10T00:00:00Z", status: "in_progress" }, now)).toBe(true);
  });
  it("loại trừ done/canceled/không hạn/đã xoá/chưa tới hạn", () => {
    expect(isOverdueTask({ due_at: "2026-08-10T00:00:00Z", status: "done" }, now)).toBe(false);
    expect(isOverdueTask({ due_at: "2026-08-10T00:00:00Z", status: "canceled" }, now)).toBe(false);
    expect(isOverdueTask({ due_at: null, status: "todo" }, now)).toBe(false);
    expect(
      isOverdueTask({ due_at: "2026-08-10T00:00:00Z", status: "todo", deleted_at: "x" }, now),
    ).toBe(false);
    expect(isOverdueTask({ due_at: "2026-08-12T00:00:00Z", status: "todo" }, now)).toBe(false);
  });
});

describe("isStaleDocument", () => {
  it("đúng ngưỡng 30 ngày", () => {
    expect(isStaleDocument({ updated_at: "2026-06-01T00:00:00Z" }, now)).toBe(true);
    expect(isStaleDocument({ updated_at: "2026-08-01T00:00:00Z" }, now)).toBe(false);
    expect(isStaleDocument({ updated_at: "2026-06-01T00:00:00Z", deleted_at: "x" }, now)).toBe(false);
  });
});

describe("isMeetingOnDay", () => {
  const day = new Date(2026, 7, 11, 15, 0, 0);
  it("chỉ nhận cuộc họp trong cùng ngày địa phương", () => {
    const inDay = new Date(2026, 7, 11, 9, 30).toISOString();
    const nextDay = new Date(2026, 7, 12, 0, 5).toISOString();
    expect(isMeetingOnDay({ start_at: inDay }, day)).toBe(true);
    expect(isMeetingOnDay({ start_at: nextDay }, day)).toBe(false);
    expect(isMeetingOnDay({ start_at: inDay, deleted_at: "x" }, day)).toBe(false);
    expect(isMeetingOnDay({ start_at: null }, day)).toBe(false);
  });
  it("localDayKey khớp ngày lọc trên lịch", () => {
    expect(localDayKey(day)).toBe("2026-08-11");
  });
});

describe("isPendingWorkflowApproval", () => {
  it("chỉ đếm pending", () => {
    expect(isPendingWorkflowApproval({ status: "pending" })).toBe(true);
    expect(isPendingWorkflowApproval({ status: "approved" })).toBe(false);
  });
});
