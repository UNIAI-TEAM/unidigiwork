import { describe, it, expect } from "vitest";
import { detectActionIntent } from "@/domain/ai-actions/contracts";
describe("intent", () => {
  it("câu hỏi hiện trạng", () => {
    for (const q of [
      "Việc nào mới cập nhật gần đây nhất và đang cần tôi xử lý?",
      "Tình hình cập nhật tuần này thế nào?",
      "Liệt kê công việc cập nhật gần đây",
      "What tasks were updated recently?",
    ]) expect(detectActionIntent(q).kind, q).toBe("NONE");
  });
  it("lệnh sửa việc vẫn nhận", () => {
    expect(detectActionIntent("Cập nhật hạn công việc này sang thứ sáu")).toEqual({ kind: "PROPOSE", actionType: "UPDATE_TASK_FIELDS" });
    expect(detectActionIntent("dời hạn task này sang tuần sau")).toEqual({ kind: "PROPOSE", actionType: "UPDATE_TASK_FIELDS" });
  });
  it("các ý định khác giữ nguyên", () => {
    expect(detectActionIntent("tạo task kiểm thử").actionType).toBe("CREATE_TASK");
    expect(detectActionIntent("gửi email cho khách").kind).toBe("BLOCKED");
  });
});
