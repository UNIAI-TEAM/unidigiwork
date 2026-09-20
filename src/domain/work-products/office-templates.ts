// Mẫu trình bày theo loại tài liệu — dùng chung cho bản xem trước và mọi bộ máy kết xuất.
import type { OfficeTemplate } from "./office-engine";

const DEFAULT_TEMPLATE: OfficeTemplate = {
  key: "DEFAULT",
  label: "Tài liệu",
  accent: "1F4FD8",
  cover: false,
  header: "UNIWORK · Kết quả công việc",
  footer: "UNIWORK",
};

const TEMPLATES: Record<string, OfficeTemplate> = {
  PROPOSAL: {
    key: "PROPOSAL",
    label: "Đề xuất",
    accent: "1F4FD8",
    cover: true,
    header: "Đề xuất giải pháp",
    footer: "Tài liệu đề xuất · Bảo mật",
  },
  REPORT: {
    key: "REPORT",
    label: "Báo cáo",
    accent: "0F7B6C",
    cover: true,
    header: "Báo cáo công việc",
    footer: "Báo cáo nội bộ",
  },
  CONTRACT: {
    key: "CONTRACT",
    label: "Hợp đồng",
    accent: "2B2B33",
    cover: false,
    header: "Hợp đồng",
    footer: "Hợp đồng · Bản thảo pháp lý",
  },
  ANALYSIS: {
    key: "ANALYSIS",
    label: "Phân tích",
    accent: "6B3FA0",
    cover: false,
    header: "Phân tích",
    footer: "Phân tích dữ liệu",
  },
  PLAN: {
    key: "PLAN",
    label: "Kế hoạch",
    accent: "B4531A",
    cover: true,
    header: "Kế hoạch triển khai",
    footer: "Kế hoạch",
  },
};

export function officeTemplateFor(businessType: string | null | undefined): OfficeTemplate {
  if (!businessType) return DEFAULT_TEMPLATE;
  return TEMPLATES[businessType] ?? { ...DEFAULT_TEMPLATE, key: businessType };
}
