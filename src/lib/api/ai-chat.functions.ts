// AI Workspace — hội thoại AI, lưu lịch sử + usage theo workspace. RLS applies.
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { streamText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";
const MODEL = "openai/gpt-5.6-sol";
const SYSTEM_PROMPT =
  "Bạn là trợ lý AI của UNIWORK, một nền tảng làm việc số cho doanh nghiệp. " +
  "Trả lời ngắn gọn, chính xác, ưu tiên tiếng Việt trừ khi người dùng dùng ngôn ngữ khác. " +
  "Khi được hỏi về dữ liệu nội bộ mà bạn không có, hãy nói rõ và gợi ý nơi tra cứu trong UNIWORK.";

type Ctx = { supabase: any; userId: string };

export type AiConversationDTO = {
  id: string;
  title: string;
  workspaceId: string | null;
  workspaceName: string | null;
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastMessageAt: string;
  createdAt: string;
};

export type AiMessageDTO = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  inputTokens: number;
  outputTokens: number;
};

export type AiWorkspaceOption = { id: string; name: string };

async function resolveTenant(ctx: Ctx): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", ctx.userId)
    .eq("status", "active");
  if (error) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: error.message });
  const rows = (data ?? []) as Array<{ tenant_id: string }>;
  if (rows.length === 0) return null;
  const hint = getCookie(ACTIVE_TENANT_COOKIE);
  return (hint && rows.find((r) => r.tenant_id === hint)?.tenant_id) || rows[0].tenant_id;
}

async function listWorkspaces(ctx: Ctx, tenantId: string): Promise<AiWorkspaceOption[]> {
  const { data } = await ctx.supabase
    .from("workspaces")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(50);
  return ((data ?? []) as Array<{ id: string; name: string }>).map((w) => ({
    id: w.id,
    name: w.name,
  }));
}

export const listAiConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ workspaceId: z.string().uuid().optional() })
      .optional()
      .parse(i),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      tenantId: string | null;
      workspaces: AiWorkspaceOption[];
      conversations: AiConversationDTO[];
    }> => {
      const ctx = context as unknown as Ctx;
      const tenantId = await resolveTenant(ctx);
      if (!tenantId) return { tenantId: null, workspaces: [], conversations: [] };
      const workspaces = await listWorkspaces(ctx, tenantId);
      let q = ctx.supabase
        .from("ai_conversations")
        .select(
          "id, title, workspace_id, model, total_input_tokens, total_output_tokens, last_message_at, created_at",
        )
        .eq("tenant_id", tenantId)
        .order("last_message_at", { ascending: false })
        .limit(50);
      if (data?.workspaceId) q = q.eq("workspace_id", data.workspaceId);
      const { data: rows, error } = await q;
      if (error) throw new ApiError({ code: "AI_CONVERSATION_LIST_FAILED", message: error.message });
      const wsMap = new Map(workspaces.map((w) => [w.id, w.name]));
      return {
        tenantId,
        workspaces,
        conversations: (rows ?? []).map((r: any) => ({
          id: r.id,
          title: r.title,
          workspaceId: r.workspace_id,
          workspaceName: r.workspace_id ? (wsMap.get(r.workspace_id) ?? null) : null,
          model: r.model,
          totalInputTokens: Number(r.total_input_tokens ?? 0),
          totalOutputTokens: Number(r.total_output_tokens ?? 0),
          lastMessageAt: r.last_message_at,
          createdAt: r.created_at,
        })),
      };
    },
  )

export const getAiConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AiMessageDTO[]> => {
    const ctx = context as unknown as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("ai_messages")
      .select("id, role, content, created_at, input_tokens, output_tokens")
      .eq("conversation_id", data.conversationId)
      .neq("role", "system")
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new ApiError({ code: "AI_MESSAGE_LIST_FAILED", message: error.message });
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
      inputTokens: r.input_tokens ?? 0,
      outputTokens: r.output_tokens ?? 0,
    }));
  });

export const deleteAiConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("ai_conversations")
      .delete()
      .eq("id", data.conversationId);
    if (error) throw new ApiError({ code: "AI_CONVERSATION_DELETE_FAILED", message: error.message });
    return { ok: true };
  });

function titleFrom(text: string) {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 60)}…` : t || "Cuộc hội thoại mới";
}

export const sendAiMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        conversationId: z.string().uuid().optional(),
        workspaceId: z.string().uuid().optional(),
        text: z.string().min(1).max(8000),
      })
      .parse(i),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ conversationId: string; reply: string; inputTokens: number; outputTokens: number }> => {
      const ctx = context as unknown as Ctx;
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new ApiError({ code: "AI_GATEWAY_UNAVAILABLE", message: "Thiếu cấu hình AI" });
      const tenantId = await resolveTenant(ctx);
      if (!tenantId)
        throw new ApiError({ code: "TENANT_CONTEXT_REQUIRED", message: "Chưa có tổ chức hoạt động" });

      // 1. Resolve or create conversation
      let conversationId = data.conversationId ?? null;
      let workspaceId = data.workspaceId ?? null;
      if (conversationId) {
        const { data: conv, error } = await ctx.supabase
          .from("ai_conversations")
          .select("id, workspace_id")
          .eq("id", conversationId)
          .maybeSingle();
        if (error || !conv)
          throw new ApiError({ code: "AI_CONVERSATION_NOT_FOUND", message: "Không tìm thấy hội thoại" });
        workspaceId = conv.workspace_id;
      } else {
        const { data: created, error } = await ctx.supabase
          .from("ai_conversations")
          .insert({
            tenant_id: tenantId,
            workspace_id: workspaceId,
            title: titleFrom(data.text),
            model: MODEL,
            created_by: ctx.userId,
          })
          .select("id")
          .single();
        if (error || !created)
          throw new ApiError({
            code: "AI_CONVERSATION_CREATE_FAILED",
            message: error?.message ?? "Không tạo được hội thoại",
          });
        conversationId = created.id as string;
      }

      // 2. Persist user message
      const { data: userMsg } = await ctx.supabase
        .from("ai_messages")
        .insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          role: "user",
          content: data.text,
          created_by: ctx.userId,
        })
        .select("id")
        .single();

      // 3. Build history
      const { data: history } = await ctx.supabase
        .from("ai_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(40);

      const started = Date.now();
      const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
      const provider = createLovableResponsesProvider(apiKey);

      let reply = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let status = "succeeded";
      let errorMessage: string | null = null;

      try {
        const result = streamText({
          model: provider.responses(MODEL),
          system: SYSTEM_PROMPT,
          messages: ((history ?? []) as Array<{ role: string; content: string }>).map((m) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          })),
          providerOptions: { openai: { store: false } },
        });
        reply = await result.text;
        const usage = await result.usage;
        inputTokens = usage?.inputTokens ?? 0;
        outputTokens = usage?.outputTokens ?? 0;
      } catch (e) {
        status = "failed";
        errorMessage = e instanceof Error ? e.message : String(e);
      }

      // 4. Persist assistant message
      let assistantMessageId: string | null = null;
      if (status === "succeeded") {
        const { data: aMsg } = await ctx.supabase
          .from("ai_messages")
          .insert({
            tenant_id: tenantId,
            conversation_id: conversationId,
            role: "assistant",
            content: reply || "(Không có nội dung trả về)",
            model: MODEL,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          })
          .select("id")
          .single();
        assistantMessageId = (aMsg?.id as string) ?? null;
      }

      // 5. Roll up conversation counters
      const { data: conv } = await ctx.supabase
        .from("ai_conversations")
        .select("total_input_tokens, total_output_tokens")
        .eq("id", conversationId)
        .maybeSingle();
      await ctx.supabase
        .from("ai_conversations")
        .update({
          total_input_tokens: Number(conv?.total_input_tokens ?? 0) + inputTokens,
          total_output_tokens: Number(conv?.total_output_tokens ?? 0) + outputTokens,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      // 6. Usage event (service role — table is read-only for users)
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("ai_usage_events").insert({
        tenant_id: tenantId,
        workspace_id: workspaceId,
        conversation_id: conversationId,
        message_id: assistantMessageId ?? (userMsg?.id as string) ?? null,
        user_id: ctx.userId,
        model: MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        duration_ms: Date.now() - started,
        run_id: provider.getRunId() ?? null,
        status,
        error_message: errorMessage,
      });

      if (status !== "succeeded")
        throw new ApiError({ code: "AI_GENERATION_FAILED", message: errorMessage ?? "AI lỗi" });

      return { conversationId: conversationId!, reply, inputTokens, outputTokens };
    },
  );

export type AiUsageSummary = {
  totalTokens: number;
  totalRequests: number;
  byWorkspace: Array<{ workspaceId: string | null; workspaceName: string; tokens: number; requests: number }>;
};

export const getAiUsageSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiUsageSummary> => {
    const ctx = context as unknown as Ctx;
    const tenantId = await resolveTenant(ctx);
    if (!tenantId) return { totalTokens: 0, totalRequests: 0, byWorkspace: [] };
    const workspaces = await listWorkspaces(ctx, tenantId);
    const wsMap = new Map(workspaces.map((w) => [w.id, w.name]));
    const { data } = await ctx.supabase
      .from("ai_usage_events")
      .select("workspace_id, total_tokens")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1000);
    const rows = (data ?? []) as Array<{ workspace_id: string | null; total_tokens: number }>;
    const agg = new Map<string, { tokens: number; requests: number }>();
    for (const r of rows) {
      const key = r.workspace_id ?? "none";
      const cur = agg.get(key) ?? { tokens: 0, requests: 0 };
      cur.tokens += Number(r.total_tokens ?? 0);
      cur.requests += 1;
      agg.set(key, cur);
    }
    return {
      totalTokens: rows.reduce((s, r) => s + Number(r.total_tokens ?? 0), 0),
      totalRequests: rows.length,
      byWorkspace: Array.from(agg.entries()).map(([id, v]) => ({
        workspaceId: id === "none" ? null : id,
        workspaceName: id === "none" ? "Không thuộc workspace" : (wsMap.get(id) ?? "Workspace"),
        tokens: v.tokens,
        requests: v.requests,
      })),
    };
  });