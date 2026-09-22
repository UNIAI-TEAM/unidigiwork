import { streamText } from "ai";
import { z } from "zod";
import { createLovableResponsesProvider } from "@/lib/ai-gateway.server";

const MODEL = "openai/gpt-6-astra";
const VERSION = "task-message-v1";

const resultSchema = z.object({
  label: z.enum(["TASK", "FEEDBACK", "RELATED_WORK", "OTHER"]),
  confidence: z.number().min(0).max(1),
  taskTitle: z.string().max(500).nullable(),
  relatedTaskId: z.string().uuid().nullable(),
});

export type TaskMessageClassification = z.infer<typeof resultSchema> & {
  model: typeof MODEL;
  version: typeof VERSION;
};

export async function classifyTaskMessage(input: {
  body: string;
  parentTitle: string;
  candidates: Array<{ id: string; title: string }>;
  apiKey: string;
}): Promise<TaskMessageClassification> {
  const provider = createLovableResponsesProvider(input.apiKey);
  const result = streamText({
    model: provider.responses(MODEL),
    system: [
      "Phân loại một tin nhắn công việc bằng tiếng Việt hoặc tiếng Anh.",
      "TASK: yêu cầu thực hiện một đầu việc mới, có hành động/bàn giao rõ ràng.",
      "FEEDBACK: nhận xét, sửa đổi, đánh giá hoặc góp ý cho công việc hiện tại.",
      "RELATED_WORK: nhắc đến một công việc khác trong danh sách ứng viên.",
      "OTHER: trao đổi, xác nhận hoặc thông tin không thuộc ba loại trên.",
      "Chỉ trả về một JSON object hợp lệ; không markdown, không giải thích.",
      "relatedTaskId chỉ được là ID trong danh sách ứng viên và chỉ dùng khi label RELATED_WORK.",
      "taskTitle là tiêu đề hành động ngắn khi label TASK, còn lại null.",
    ].join("\n"),
    prompt: JSON.stringify({
      currentTask: input.parentTitle,
      message: input.body,
      relatedTaskCandidates: input.candidates,
      requiredJson: {
        label: "TASK|FEEDBACK|RELATED_WORK|OTHER",
        confidence: "number 0..1",
        taskTitle: "string|null",
        relatedTaskId: "uuid|null",
      },
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
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("TASK_MESSAGE_CLASSIFIER_INVALID_OUTPUT");
  const parsed = resultSchema.parse(JSON.parse(raw.slice(start, end + 1)));
  const candidateIds = new Set(input.candidates.map((candidate) => candidate.id));
  const relatedTaskId =
    parsed.label === "RELATED_WORK" &&
    parsed.relatedTaskId &&
    candidateIds.has(parsed.relatedTaskId)
      ? parsed.relatedTaskId
      : null;
  return {
    ...parsed,
    label: parsed.label === "RELATED_WORK" && !relatedTaskId ? "OTHER" : parsed.label,
    relatedTaskId,
    model: MODEL,
    version: VERSION,
  };
}
