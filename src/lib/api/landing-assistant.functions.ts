// Trợ lý AI công khai trên landing page: tư vấn, giải đáp và hỗ trợ bán hàng.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { streamText } from "ai";
import { createLovableResponsesProvider } from "@/lib/ai-gateway.server";

const MODEL = "openai/gpt-5.6-sol";

const Schema = z.object({
  locale: z.string().min(2).max(8).default("vi"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(16),
});

export type LandingAssistantReply = {
  answer: string;
  suggestions: string[];
};

const SYSTEM = `Bạn là chuyên viên tư vấn giải pháp của UNIWORK (uniwork) — nền tảng làm việc kết hợp Con người + Nhân sự AI.
Năng lực sản phẩm: Chat & Tasks, Projects, Docs, Calendar, Meetings (họp trực tuyến, ghi hình, biên bản AI), Email Hub, Work Graph & Memory, AI Workforce (đội ngũ agent AI thực thi công việc), Universal Search, Copilot, báo cáo và bảng giá theo gói.
Nguyên tắc:
- Trả lời ngắn gọn, tối đa 120 từ, giọng chuyên nghiệp, thân thiện.
- Luôn trả lời bằng ngôn ngữ của người dùng (locale được cung cấp).
- Chỉ nói về những gì UNIWORK thực sự cung cấp; không bịa tính năng, con số, khách hàng hay cam kết SLA.
- Hướng người dùng tới hành động tiếp theo: dùng thử miễn phí, xem bảng giá, đặt lịch demo hoặc để lại liên hệ.
- Không hỏi hoặc thu thập mật khẩu, số thẻ, thông tin nhạy cảm.`;

const hits = new Map<string, { count: number; ts: number }>();
function allow(key: string) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.ts > 60_000) {
    hits.set(key, { count: 1, ts: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= 12;
}

export const askLandingAssistant = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => Schema.parse(i))
  .handler(async ({ data }): Promise<LandingAssistantReply> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI_UNAVAILABLE");

    const last = data.messages[data.messages.length - 1]?.content ?? "";
    if (!allow(`${data.locale}:${last.slice(0, 16)}`)) throw new Error("RATE_LIMITED");

    const provider = createLovableResponsesProvider(apiKey);
    const result = streamText({
      model: provider.responses(MODEL),
      system: `${SYSTEM}\nLocale: ${data.locale}`,
      messages: data.messages,
      providerOptions: { lovable: { max_completion_tokens: 600 } },
    });

    const answer = (await result.text).trim();
    return { answer, suggestions: [] };
  });
