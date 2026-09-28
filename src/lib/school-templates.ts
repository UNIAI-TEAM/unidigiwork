// Mẫu văn bản Gói Trường học: chỉ khung mục + câu gợi ý, không có dữ liệu giả.
export const SCHOOL_TEMPLATE_KEYS = [
  "YEAR_PLAN",
  "PERIOD_PLAN",
  "COUNCIL_MINUTES",
  "DEPT_MINUTES",
  "TERM_REPORT",
  "EVENT_PLAN",
  "INCIDENT_REPORT",
  "DIRECTIVE",
] as const;
export type SchoolTemplateKey = (typeof SCHOOL_TEMPLATE_KEYS)[number];

export const SCHOOL_TEMPLATE_TYPE: Record<SchoolTemplateKey, string> = {
  YEAR_PLAN: "PLAN",
  PERIOD_PLAN: "PLAN",
  COUNCIL_MINUTES: "MEMO",
  DEPT_MINUTES: "MEMO",
  TERM_REPORT: "REPORT",
  EVENT_PLAN: "PLAN",
  INCIDENT_REPORT: "REPORT",
  DIRECTIVE: "MEMO",
};

const S = (...sections: [string, string][]) =>
  sections.map(([h, hint]) => `## ${h}\n\n_${hint}_\n`).join("\n");

export function schoolTemplateBody(key: SchoolTemplateKey, title: string): string {
  const head = `# ${title}\n\n`;
  const body: Record<SchoolTemplateKey, string> = {
    YEAR_PLAN: S(
      ["Căn cứ", "Văn bản hướng dẫn của cấp trên, tình hình thực tế của trường."],
      ["Mục tiêu năm học", "Mục tiêu chung và chỉ tiêu cụ thể có thể đo được."],
      ["Nhiệm vụ trọng tâm", "Dạy học, giáo dục, cơ sở vật chất, đội ngũ."],
      ["Giải pháp", "Cách thực hiện cho từng nhiệm vụ."],
      ["Kế hoạch theo tháng", "Việc chính, người phụ trách, thời hạn."],
      ["Tổ chức thực hiện", "Phân công BGH, tổ chuyên môn, bộ phận."],
    ),
    PERIOD_PLAN: S(
      ["Đánh giá kỳ trước", "Việc đã xong, việc còn tồn."],
      ["Công việc trọng tâm", "Mỗi việc ghi rõ người phụ trách và hạn."],
      ["Lịch hoạt động", "Họp, kiểm tra, sự kiện theo ngày."],
      ["Đề xuất, kiến nghị", "Nội dung cần BGH quyết."],
    ),
    COUNCIL_MINUTES: S(
      ["Thời gian, địa điểm", "Ngày giờ, phòng họp hoặc họp trực tuyến."],
      ["Thành phần", "Chủ trì, thư ký, số người có mặt / vắng."],
      ["Nội dung", "Các vấn đề được trình bày."],
      ["Ý kiến thảo luận", "Tóm tắt ý kiến chính."],
      ["Kết luận của chủ trì", "Quyết định, chỉ đạo, người thực hiện, thời hạn."],
    ),
    DEPT_MINUTES: S(
      ["Thời gian, thành phần", "Tổ chuyên môn, người chủ trì, thư ký."],
      ["Đánh giá hoạt động", "Tiến độ chương trình, dự giờ, chuyên đề."],
      ["Nội dung sinh hoạt chuyên môn", "Chủ đề, bài dạy minh họa, góp ý."],
      ["Kế hoạch tiếp theo", "Việc, người phụ trách, hạn."],
    ),
    TERM_REPORT: S(
      ["Tình hình chung", "Quy mô lớp, đội ngũ, điều kiện."],
      ["Kết quả thực hiện nhiệm vụ", "Theo từng nhiệm vụ trọng tâm; ghi nguồn số liệu."],
      ["Hạn chế, nguyên nhân", "Nêu cụ thể."],
      ["Phương hướng kỳ tới", "Mục tiêu và giải pháp."],
    ),
    EVENT_PLAN: S(
      ["Mục đích, yêu cầu", "Ý nghĩa và kết quả mong đợi."],
      ["Thời gian, địa điểm, đối tượng", "Khối, lớp tham gia."],
      ["Nội dung, chương trình", "Các hoạt động theo trình tự."],
      ["Phân công", "Bộ phận, người phụ trách."],
      ["Kinh phí, an toàn", "Dự trù và phương án đảm bảo an toàn."],
    ),
    INCIDENT_REPORT: S(
      ["Thời gian, địa điểm", "Khi nào, ở đâu."],
      ["Mô tả sự việc", "Chỉ ghi sự việc đã xác minh. Không ghi thông tin cá nhân học sinh không cần thiết."],
      ["Mức độ ảnh hưởng", "Người, tài sản, hoạt động dạy học."],
      ["Xử lý ban đầu", "Việc đã làm, người xử lý."],
      ["Đề xuất", "Việc cần BGH quyết định."],
    ),
    DIRECTIVE: S(
      ["Nội dung chỉ đạo", "Việc cần làm, nêu rõ kết quả mong muốn."],
      ["Người / bộ phận thực hiện", "Người chịu trách nhiệm chính."],
      ["Thời hạn", "Ngày hoàn thành."],
      ["Báo cáo kết quả", "Hình thức và thời điểm báo cáo."],
    ),
  };
  return head + body[key];
}
