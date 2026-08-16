// UNI WORKSPACE COPILOT V1 — endpoint duy nhất của Copilot. READ-ONLY.
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { streamText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { WORK_ENTITY_TYPES } from "@/domain/work-graph/relationship-types";
import type { AiContextPack } from "@/domain/ai-context/contracts";
import { usableSources, validateAnswerCitations } from "@/domain/ai-context/citations";
import type { UniCopilotResponse } from "@/domain/ai-copilot/contracts";
import {
  buildCopilotSystemPrompt,
  buildFollowUpSuggestions,
  detectCopilotIntent,
  isMutationRequest,
  rootContextKey,
} from "@/domain/ai-copilot/contracts";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";
const MODEL = "openai/gpt-5.6-sol";

const CopilotSchema = z.object({
  query: z.string().min(2).max(500),
  rootEntity: z.object({ type: z.enum(WORK_ENTITY_TYPES), id: z.string().uuid() }).nullish(),
  workspaceId: z.string().uuid().nullish(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional(),
});

export const askUniCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CopilotSchema.parse(i))
  .handler(async ({ data, context }): Promise<UniCopilotResponse> => {
    const {
      checkCopilotRateLimit,
      parseCopilotModelOutput,
      buildCopilotUserPrompt,
    } = await import("./ai-copilot.server");
    const { buildAiContextPack, renderContextForModel } = await import("./ai-context.server");

    if (!checkCopilotRateLimit(context.userId)) {
      throw new ApiError({ code: "RATE_LIMITED", message: "Bạn đang hỏi quá nhanh. Thử lại sau ít giây." });
    }

    const totalStart = Date.now();
    const intent = detectCopilotIntent(data.query);

    let pack: AiContextPack;
    const ctxStart = Date.now();
    try {
      pack = await buildAiContextPack(
        context.supabase,
        context.userId,
        getCookie(ACTIVE_TENANT_COOKIE) ?? null,
        {
          query: data.query,
          rootEntity: data.rootEntity ?? null,
          workspaceId: data.workspaceId ?? null,
        },
      );
    } catch {
      throw new ApiError({
        code: "RESOURCE_NOT_FOUND",
        message: "Không tìm thấy đối tượng gốc hoặc bạn không có quyền xem.",
      });
    }
    const contextMs = Date.now() - ctxStart;
    const safeSources = usableSources(pack.sources);

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ApiError({ code: "AI_GATEWAY_UNAVAILABLE", message: "UNI hiện chưa thể trả lời. Vui lòng thử lại." });

    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
    const provider = createLovableResponsesProvider(apiKey);

    let raw = "";
    let usage: UniCopilotResponse["usage"] = null;
    const provStart = Date.now();
    try {
      const result = streamText({
        model: provider.responses(MODEL),
        system: buildCopilotSystemPrompt(intent),
        prompt: buildCopilotUserPrompt({
          query: data.query,
          intent,
          contextBlock: renderContextForModel(pack),
          conversation: data.history ?? [],
        }),
        maxOutputTokens: 1100,
        temperature: 0.2,
        providerOptions: {
          openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false },
        },
      });
      raw = await result.text;
      const u = await result.usage;
      usage = { inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0, model: MODEL };
    } catch {
      throw new ApiError({ code: "AI_GATEWAY_UNAVAILABLE", message: "UNI hiện chưa thể trả lời. Vui lòng thử lại." });
    }
    const providerMs = Date.now() - provStart;

    const parsed = parseCopilotModelOutput(raw);
    const validated = validateAnswerCitations(parsed.answer, safeSources, parsed.citationIds);

    const answer =
      validated.answer.trim() ||
      (isMutationRequest(data.query)
        ? "UNI V1 chỉ đọc dữ liệu và chưa được phép thay đổi công việc."
        : "Tôi chưa tìm thấy dữ liệu UniWork đủ để trả lời câu hỏi này.");

    // Giữ ngữ cảnh gốc cho lượt sau: ưu tiên root client gửi lên, nếu không có thì lấy root engine đã giải nghĩa.
    const packRoot = pack.root ?? null;
    const resolvedRoot: UniCopilotResponse["resolvedRoot"] = data.rootEntity
      ? {
          type: data.rootEntity.type,
          id: data.rootEntity.id,
          title: packRoot?.title ?? "",
        }
      : packRoot
        ? { type: packRoot.entityType, id: packRoot.entityId, title: packRoot.title }
        : null;

    const citedSources = (validated.citedSources.length ? validated.citedSources : safeSources.slice(0, 3)).map((s) => ({
      entityType: s.entityType,
      title: s.title,
    }));
    const askedQuestions = [...(data.history ?? []).filter((t) => t.role === "user").map((t) => t.content), data.query];
    const suggestions = buildFollowUpSuggestions({
      intent,
      root: resolvedRoot ? { type: resolvedRoot.type, id: resolvedRoot.id, title: resolvedRoot.title } : null,
      citedSources,
      askedQuestions,
      modelSuggestions: parsed.suggestions,
    });

    // Telemetry chi phí/ngân sách — fire-and-forget, không lưu nội dung nguồn (§76, §114).
    try {
      await context.supabase.from("ai_context_metrics" as never).insert({
        tenant_id: pack.tenantId || null,
        request_id: pack.requestId,
        operation: "COPILOT",
        strategy: pack.retrieval.strategy,
        root_entity_type: pack.root?.entityType ?? null,
        estimated_tokens: pack.budget.estimatedTokens,
        max_tokens: pack.budget.maxTokens,
        source_count: safeSources.length,
        truncated: pack.retrieval.truncated,
        partial: pack.partial,
        latency_ms: Date.now() - totalStart,
        timings: { ...pack.retrieval.timings, contextMs, providerMs },
      } as never);
    } catch {
      /* telemetry không được phép làm hỏng câu trả lời */
    }

    return {
      requestId: pack.requestId,
      intent,
      answer,
      sections: parsed.sections,
      sources: validated.citedSources.length ? validated.citedSources : safeSources.slice(0, 5),
      suggestions,
      partial: pack.partial,
      ambiguity: pack.ambiguity ?? null,
      rootContextKey: rootContextKey(resolvedRoot ? { type: resolvedRoot.type, id: resolvedRoot.id } : null),
      resolvedRoot,
      usage,
      timings: { contextMs, providerMs, totalMs: Date.now() - totalStart },
    };
  });
