// Chọn bộ máy kết xuất: ưu tiên GenOffice (dịch vụ ngoài), dự phòng bộ máy nội bộ.
import {
  OFFICE_FORMAT_META,
  parseContentBlocks,
  type OfficeEngineAdapter,
  type OfficeFormat,
  type OfficeRenderRequest,
  type OfficeRenderResult,
} from "@/domain/work-products/office-engine";
import { officeTemplateFor } from "@/domain/work-products/office-templates";
import { builtinOfficeEngine } from "./office-builtin.server";

const TIMEOUT_MS = 25_000;

/** Adapter HTTP cho GenOffice; bật khi có GENOFFICE_URL. */
function genOfficeAdapter(baseUrl: string, apiKey: string | undefined): OfficeEngineAdapter {
  return {
    name: "genoffice",
    supports: () => true,
    async render(req: OfficeRenderRequest): Promise<OfficeRenderResult> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const template = req.template ?? officeTemplateFor(req.businessType);
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/render`, {
          method: "POST",
          signal: ctrl.signal,
          headers: {
            "content-type": "application/json",
            accept: OFFICE_FORMAT_META[req.format].mime,
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            format: req.format,
            title: req.title,
            content: req.content,
            // Cấu trúc đã chuẩn hoá để GenOffice dựng đúng heading/bảng/danh sách.
            blocks: parseContentBlocks(req.content),
            template,
            businessType: req.businessType,
            version: req.version,
            workProductId: req.workProductId,
            provenance: req.provenance,
          }),
        });
        if (!res.ok) throw new Error(`GENOFFICE_HTTP_${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (!buf.byteLength) throw new Error("GENOFFICE_EMPTY_RESPONSE");
        return {
          bytes: buf,
          mimeType: res.headers.get("content-type") ?? OFFICE_FORMAT_META[req.format].mime,
          engine: "genoffice",
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export type OfficeRenderOutcome = OfficeRenderResult & { fallbackReason?: string };

/** Lựa chọn bộ máy kết xuất. COMPARE do lớp đối chứng xử lý, không dùng ở đây. */
export const OFFICE_ENGINE_CHOICES = ["AUTO", "BUILTIN", "GENOFFICE", "COMPARE"] as const;
export type OfficeEngineChoice = (typeof OFFICE_ENGINE_CHOICES)[number];

/** Dịch vụ Office Engine đặt ở máy chủ khác (của UniWork) đã cấu hình chưa. */
export function officeEngineConfigured(): boolean {
  return Boolean(process.env["GENOFFICE_URL"]);
}

/**
 * Nhánh GenOffice: ưu tiên dịch vụ Office Engine riêng của UniWork nếu có
 * `GENOFFICE_URL`; nếu không, chạy trực tiếp bộ máy GenOffice đã nhúng
 * (hiện chỉ hỗ trợ DOCX). Không bao giờ trả kết quả của bộ máy nội bộ dưới
 * nhãn genoffice.
 */
export async function renderWithGenOffice(req: OfficeRenderRequest): Promise<OfficeRenderResult> {
  const baseUrl = process.env["GENOFFICE_URL"];
  if (baseUrl) return genOfficeAdapter(baseUrl, process.env["GENOFFICE_API_KEY"]).render(req);
  if (req.format !== "DOCX") throw new Error("GENOFFICE_FORMAT_UNSUPPORTED");
  const { renderDocxWithGenOffice } = await import("./office-genoffice.server");
  return renderDocxWithGenOffice(req);
}

/**
 * Kết xuất một bản thể hiện.
 * - AUTO: giữ hành vi an toàn hiện tại (thử GenOffice, hỏng thì dùng bộ máy nội bộ).
 * - BUILTIN / GENOFFICE: ép đúng một bộ máy, không thay thế ngầm.
 * Kết quả luôn ghi lại bộ máy đã dùng thật sự.
 */
export async function renderOfficeArtifact(
  req: OfficeRenderRequest,
  opts: { engine?: OfficeEngineChoice } = {},
): Promise<OfficeRenderOutcome> {
  const withTemplate: OfficeRenderRequest = {
    ...req,
    template: req.template ?? officeTemplateFor(req.businessType),
  };
  const engine = opts.engine ?? "AUTO";
  if (engine === "BUILTIN") return builtinOfficeEngine.render(withTemplate);
  if (engine === "GENOFFICE") return renderWithGenOffice(withTemplate);

  const canGenOffice = Boolean(process.env["GENOFFICE_URL"]) || withTemplate.format === "DOCX";
  if (canGenOffice) {
    try {
      return await renderWithGenOffice(withTemplate);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "GENOFFICE_UNAVAILABLE";
      const out = await builtinOfficeEngine.render(withTemplate);
      return { ...out, fallbackReason: reason };
    }
  }
  return builtinOfficeEngine.render(withTemplate);
}

export function officeMime(format: OfficeFormat) {
  return OFFICE_FORMAT_META[format].mime;
}
