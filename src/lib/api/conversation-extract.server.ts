// Server-only: AI extraction of work items from a conversation source.
import { streamText } from "ai";
import { z } from "zod";
import { createLovableResponsesProvider } from "@/lib/ai-gateway.server";

const MODEL = "openai/gpt-6-astra";

export const proposalSchema = z.object({
  kind: z.enum(["TASK", "DECISION", "COMMITMENT", "KNOWLEDGE"]),
  title: z.string().min(1).max(500),
  description: z.string().max(4000).nullable().default(null),
  evidence: z.string().max(2000).default(""),
  confidence: z.number().min(0).max(1).default(0.5),
  missingFields: z.array(z.string().max(60)).max(8).default([]),
});

export type ExtractedProposal = z.infer<typeof proposalSchema>;

const outputSchema = z.object({ proposals: z.array(proposalSchema).max(20).default([]) });

export type SourceMessage = {
  id: string;
  author: string;
  sentAt: string | null;
  body: string;
};

function parseJsonBlock(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("EXTRACTION_INVALID_OUTPUT");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Rút trích đề xuất công việc từ nội dung hội thoại. Không bịa owner/deadline. */
export async function extractWorkFromConversation(input: {
  apiKey: string;
  title: string;
  channel: string;
  messages: SourceMessage[];
}): Promise<ExtractedProposal[]> {
  const provider = createLovableResponsesProvider(input.apiKey);
  const result = streamText({
    model: provider.responses(MODEL),
    system: [
      "Bạn rút trích công việc từ một đoạn hội thoại nội bộ hoặc hội thoại nhập từ ứng dụng nhắn tin.",
      "Trả về JSON object duy nhất: {\"proposals\":[...]}; không markdown, không giải thích.",
      "Mỗi proposal gồm: kind (TASK|DECISION|COMMITMENT|KNOWLEDGE), title, description, evidence, confidence, missingFields.",
      "evidence PHẢI là đoạn trích nguyên văn ngắn từ hội thoại nguồn, không được viết lại.",
      "TUYỆT ĐỐI không suy đoán người phụ trách hay hạn chót. Nếu nguồn không nêu rõ, bỏ trống và ghi vào missingFields (ví dụ: owner, dueDate).",
      "COMMITMENT là lời hứa với khách hàng hoặc đối tác bên ngoài.",
      "KNOWLEDGE là thông tin đáng lưu lại để dùng lại sau.",
      "Chỉ rút trích điều thực sự có trong hội thoại. Nếu không có gì, trả proposals rỗng.",
      "Ngôn ngữ của title/description theo ngôn ngữ hội thoại (mặc định tiếng Việt).",
    ].join("\n"),
    prompt: JSON.stringify({
      conversationTitle: input.title,
      channel: input.channel,
      messages: input.messages.slice(-120).map((m) => ({
        author: m.author,
        at: m.sentAt,
        text: m.body.slice(0, 2000),
      })),
    }),
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const raw = await result.text;
  const parsed = outputSchema.parse(parseJsonBlock(raw));
  return parsed.proposals;
}

const intelligenceSchema = z.object({
  answer: z.string().min(1).max(4000),
  citations: z
    .array(z.object({ messageId: z.string().max(80).nullable().default(null), excerpt: z.string().max(500) }))
    .max(10)
    .default([]),
});

export type ConversationIntelligence = z.infer<typeof intelligenceSchema>;

/** Trả lời câu hỏi về hội thoại, luôn kèm trích dẫn nguồn. */
export async function answerConversationQuestion(input: {
  apiKey: string;
  question: string;
  title: string;
  messages: SourceMessage[];
}): Promise<ConversationIntelligence> {
  const provider = createLovableResponsesProvider(input.apiKey);
  const result = streamText({
    model: provider.responses(MODEL),
    system: [
      "Bạn tóm tắt và trả lời câu hỏi về một hội thoại công việc.",
      "Trả về JSON object duy nhất: {\"answer\":string,\"citations\":[{\"messageId\":string|null,\"excerpt\":string}]}.",
      "answer viết ngắn gọn, có gạch đầu dòng khi liệt kê, bằng ngôn ngữ của hội thoại.",
      "Mọi khẳng định quan trọng phải có ít nhất một citation trích nguyên văn từ hội thoại.",
      "Nếu hội thoại không đủ dữ liệu, nói rõ là chưa đủ dữ liệu; không bịa.",
    ].join("\n"),
    prompt: JSON.stringify({
      question: input.question,
      conversationTitle: input.title,
      messages: input.messages.slice(-120).map((m) => ({
        id: m.id,
        author: m.author,
        at: m.sentAt,
        text: m.body.slice(0, 2000),
      })),
    }),
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const raw = await result.text;
  return intelligenceSchema.parse(parseJsonBlock(raw));
}
