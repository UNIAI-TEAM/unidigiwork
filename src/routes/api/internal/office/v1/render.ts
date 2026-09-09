// UniWork Office Engine Service — điểm cuối nội bộ (service-to-service).
// Không có mô hình đăng nhập người dùng; chỉ chấp nhận yêu cầu mang bí mật dịch vụ.
// Không lưu nội dung tài liệu, không ghi log nội dung, chỉ ghi siêu dữ liệu.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  format: z.literal("DOCX"),
  title: z.string().max(300),
  content: z.string().max(400_000),
  businessType: z.string().max(60).default("DOCUMENT"),
  version: z.number().int().positive().default(1),
  workProductId: z.string().max(80).default(""),
  provenance: z
    .array(
      z.object({
        type: z.string().max(40),
        id: z.string().max(80),
        title: z.string().max(300),
        stamp: z.string().max(80).nullable().optional(),
      }),
    )
    .max(50)
    .default([]),
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request: Request): boolean {
  const expected = process.env["OFFICE_ENGINE_SERVICE_SECRET"] ?? "";
  if (!expected) return false;
  const header = request.headers.get("x-office-engine-secret") ?? "";
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return timingSafeEqual(header, expected) || timingSafeEqual(bearer, expected);
}

export const Route = createFileRoute("/api/internal/office/v1/render")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const { renderDocxWithGenOffice, GENOFFICE_COMMIT, GENOFFICE_ENGINE_VERSION } = await import(
          "@/lib/api/office-genoffice.server"
        );
        const startedAt = Date.now();
        try {
          const out = await renderDocxWithGenOffice({ ...parsed, template: undefined });
          return new Response(out.bytes as unknown as BodyInit, {
            headers: {
              "content-type": out.mimeType,
              "cache-control": "no-store",
              "x-office-engine": "genoffice",
              "x-office-engine-version": GENOFFICE_ENGINE_VERSION,
              "x-office-engine-commit": GENOFFICE_COMMIT,
              "x-office-render-ms": String(Date.now() - startedAt),
            },
          });
        } catch (e) {
          // Chỉ ghi mã lỗi, không ghi nội dung tài liệu.
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "RENDER_FAILED" },
            { status: 500 },
          );
        }
      },
    },
  },
});
