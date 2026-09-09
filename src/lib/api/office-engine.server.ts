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

/** Bộ máy ngoài đã cấu hình hay chưa. */
export function officeEngineConfigured(): boolean {
  return Boolean(process.env["GENOFFICE_URL"]);
}

/** Kết xuất một bản thể hiện; tự chuyển sang bộ máy nội bộ nếu GenOffice lỗi. */
export async function renderOfficeArtifact(req: OfficeRenderRequest): Promise<OfficeRenderOutcome> {
  const withTemplate: OfficeRenderRequest = {
    ...req,
    template: req.template ?? officeTemplateFor(req.businessType),
  };
  const baseUrl = process.env["GENOFFICE_URL"];
  if (baseUrl) {
    try {
      return await genOfficeAdapter(baseUrl, process.env["GENOFFICE_API_KEY"]).render(withTemplate);
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
