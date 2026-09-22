// AI Workspace — hội thoại AI, lưu lịch sử + usage theo workspace. RLS applies.
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import type { AiContextPack } from "@/domain/ai-context/contracts";
import { WORK_ENTITY_TYPES } from "@/domain/work-graph/relationship-types";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";
const MODEL = "openai/gpt-6-astra";
const SYSTEM_PROMPT = [
  "Bạn là UNI, giao diện điều khiển công việc của UNIWORK.",
  "Trả lời ngắn gọn, chính xác và dựa trên ngữ cảnh công việc được cấp.",
  "Conversation là bề mặt điều khiển; khi phù hợp hãy nêu rõ action, decision hoặc Work Product nên là kết quả tiếp theo.",
  "Mỗi câu trả lời là một Executive Brief cho đúng một nhiệm vụ và bắt buộc có đúng bốn mục Markdown theo thứ tự: ## Kết luận, ## Việc cần làm, ## Hạn, ## Người phụ trách.",
  "Kết luận gồm tối đa 3 câu. Việc cần làm gồm tối đa 3 gạch đầu dòng, ưu tiên động từ hành động. Hạn dùng ngày giờ cụ thể nếu dữ liệu có; nếu chưa có ghi Chưa xác định. Người phụ trách dùng tên người hoặc AI Agent có căn cứ; nếu chưa có ghi Chưa xác định.",
  "Không dùng bảng Markdown, không lặp lại tiêu đề nhiệm vụ, không bịa hạn hoặc người phụ trách. Gắn rõ Đã xác nhận, Đang chờ hoặc AI đề xuất khi trạng thái chưa chắc chắn.",
  "Ưu tiên tiếng Việt trừ khi người dùng dùng ngôn ngữ khác.",
].join(" ");

const FULL_REPORT_SYSTEM_PROMPT = [
  "Bạn là UNI, chuyên gia lập báo cáo điều hành của UNIWORK.",
  "Từ Executive Brief và ngữ cảnh đã được cấp, soạn một báo cáo Markdown đầy đủ cho đúng một nhiệm vụ.",
  "Bắt buộc có đúng các mục theo thứ tự: # Báo cáo công việc, ## Tóm tắt điều hành, ## Mục tiêu, ## Chỉ tiêu / KPI, ## Kế hoạch hành động, ## Deadline, ## Phân công, ## Tiến độ Work Graph, ## Rủi ro và kiến nghị, ## Nguồn.",
  "Mục Chỉ tiêu / KPI phải nêu giá trị hiện tại, mục tiêu và cách đo nếu dữ liệu có. Mục Tiến độ Work Graph phải nêu phần trăm, số bước hoàn tất/tổng số bước và trạng thái nếu dữ liệu có.",
  "Không bịa số liệu, deadline hoặc người phụ trách. Dữ liệu chưa có phải ghi Chưa xác định; đề xuất của AI phải ghi rõ AI đề xuất.",
  "Nguồn phải liệt kê mã nguồn [S1], [S2] có trong ngữ cảnh; không tạo mã nguồn mới. Không dùng bảng Markdown.",
  "Ưu tiên tiếng Việt trừ khi người dùng dùng ngôn ngữ khác.",
].join(" ");

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
  deletedAt: string | null;
};

export type AiMessageDTO = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  inputTokens: number;
  outputTokens: number;
  metadata: AiMessageMetadata | null;
};

/** Ngữ cảnh điều hướng người dùng đã mở từ AI Assistant (đường dẫn + filter). */
export type AiOpenedLink = {
  label?: string;
  path: string;
  filters?: Record<string, string | number | boolean>;
  at?: string;
};

export type AiMessageMetadata = {
  source?: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
  rangeDays?: number;
  openedLinks?: AiOpenedLink[];
  contextLabels?: string[];
  /** Work Graph: thực thể người dùng đính kèm ở composer (task/decision/document/work product...). */
  contextEntities?: Array<{ type: string; id: string; label?: string }>;
  sources?: Array<{
    sourceId: string;
    entityType: string;
    entityId: string;
    title: string;
    href: string;
    updatedAt: string | null;
  }>;
  /** Executive Brief được lưu bền vững ngay sau khi AI trả lời. */
  workProductId?: string;
  workProductHref?: string;
  workProductStatus?: "CREATED" | "FAILED";
  workProductError?: string;
};

const openedLinkSchema = z.object({
  label: z.string().max(120).optional(),
  path: z.string().max(300),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  at: z.string().max(40).optional(),
});

const messageMetadataSchema = z.object({
  source: z.string().max(60).optional(),
  workspaceId: z.string().uuid().nullish(),
  workspaceName: z.string().max(200).nullish(),
  rangeDays: z.number().int().min(1).max(3650).optional(),
  openedLinks: z.array(openedLinkSchema).max(10).optional(),
  contextLabels: z.array(z.string().max(160)).max(12).optional(),
  contextEntities: z
    .array(
      z.object({
        type: z.enum(WORK_ENTITY_TYPES),
        id: z.string().uuid(),
        label: z.string().max(200).optional(),
      }),
    )
    .max(8)
    .optional(),
  sources: z
    .array(
      z.object({
        sourceId: z.string().max(200),
        entityType: z.string().max(40),
        entityId: z.string().max(100),
        title: z.string().max(300),
        href: z.string().max(500),
        updatedAt: z.string().nullable(),
      }),
    )
    .max(8)
    .optional(),
  workProductId: z.string().uuid().optional(),
  workProductHref: z.string().max(500).optional(),
  workProductStatus: z.enum(["CREATED", "FAILED"]).optional(),
  workProductError: z.string().max(500).optional(),
});

export type AiWorkspaceOption = { id: string; name: string };

export type AiConversationExportRow = AiConversationDTO & {
  messageCount: number;
  usageMinutes: number;
  totalTokens: number;
};

export type AiMessageVersionDTO = {
  id: string;
  version: number;
  content: string;
  createdAt: string;
};

export type TaskConversationDTO = {
  id: string;
  title: string;
  lastMessageAt: string;
  messages: AiMessageDTO[];
};

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
      .object({
        workspaceId: z.string().uuid().optional(),
        q: z.string().max(200).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        deleted: z.boolean().optional(),
        sort: z
          .enum(["recent", "oldest", "created_desc", "created_asc", "usage_desc", "usage_asc"])
          .optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      })
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
      nextOffset: number | null;
      total: number;
    }> => {
      const ctx = context as unknown as Ctx;
      const tenantId = await resolveTenant(ctx);
      if (!tenantId)
        return { tenantId: null, workspaces: [], conversations: [], nextOffset: null, total: 0 };
      const workspaces = await listWorkspaces(ctx, tenantId);
      const limit = data?.limit ?? 20;
      const offset = data?.offset ?? 0;
      const sort = data?.sort ?? "recent";
      const sortSpec: Record<string, { col: string; asc: boolean }> = {
        recent: { col: "last_message_at", asc: false },
        oldest: { col: "last_message_at", asc: true },
        created_desc: { col: "created_at", asc: false },
        created_asc: { col: "created_at", asc: true },
        usage_desc: { col: "total_output_tokens", asc: false },
        usage_asc: { col: "total_output_tokens", asc: true },
      };
      const { col: sortCol, asc: sortAsc } = sortSpec[sort]!;
      let q = ctx.supabase
        .from("ai_conversations")
        .select(
          "id, title, workspace_id, model, total_input_tokens, total_output_tokens, last_message_at, created_at, deleted_at",
          { count: "exact" },
        )
        .eq("tenant_id", tenantId)
        .order(sortCol, { ascending: sortAsc, nullsFirst: false })
        .order("last_message_at", { ascending: false })
        .range(offset, offset + limit - 1);
      q = data?.deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
      if (data?.workspaceId) q = q.eq("workspace_id", data.workspaceId);
      const term = data?.q?.trim();
      if (term) q = q.ilike("title", `%${term.replace(/[%_]/g, "")}%`);
      if (data?.from) q = q.gte("last_message_at", new Date(data.from).toISOString());
      if (data?.to) {
        const end = new Date(data.to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("last_message_at", end.toISOString());
      }
      const { data: rows, error, count } = await q;
      if (error)
        throw new ApiError({ code: "AI_CONVERSATION_LIST_FAILED", message: error.message });
      const wsMap = new Map(workspaces.map((w) => [w.id, w.name]));
      const list = rows ?? [];
      const total = count ?? offset + list.length;
      return {
        tenantId,
        workspaces,
        nextOffset: offset + list.length < total ? offset + list.length : null,
        total,
        conversations: list.map((r: any) => ({
          id: r.id,
          title: r.title,
          workspaceId: r.workspace_id,
          workspaceName: r.workspace_id ? (wsMap.get(r.workspace_id) ?? null) : null,
          model: r.model,
          totalInputTokens: Number(r.total_input_tokens ?? 0),
          totalOutputTokens: Number(r.total_output_tokens ?? 0),
          lastMessageAt: r.last_message_at,
          createdAt: r.created_at,
          deletedAt: r.deleted_at ?? null,
        })),
      };
    },
  );

export const getAiConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AiMessageDTO[]> => {
    const ctx = context as unknown as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("ai_messages")
      .select("id, role, content, created_at, input_tokens, output_tokens, metadata")
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
      metadata:
        r.metadata && typeof r.metadata === "object" && Object.keys(r.metadata).length > 0
          ? (r.metadata as AiMessageMetadata)
          : null,
    }));
  });

/** Lịch sử hội thoại đã gắn hoặc trích dẫn một task, giới hạn theo tenant và RLS của người dùng. */
export const getTaskConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<TaskConversationDTO[]> => {
    const ctx = context as unknown as Ctx;
    const tenantId = await resolveTenant(ctx);
    if (!tenantId) return [];

    const { data: task, error: taskError } = await ctx.supabase
      .from("tasks")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", data.taskId)
      .is("deleted_at", null)
      .maybeSingle();
    if (taskError)
      throw new ApiError({ code: "AI_MESSAGE_LIST_FAILED", message: taskError.message });
    if (!task) return [];

    // Indexed, permission-aware lookup avoids scanning only the latest tenant messages,
    // which could hide older conversations in active organizations.
    const { data: linkedRows, error: linkedError } = await ctx.supabase.rpc(
      "list_task_conversation_ids",
      { _task_id: data.taskId, _limit: 20 },
    );
    if (linkedError)
      throw new ApiError({ code: "AI_MESSAGE_LIST_FAILED", message: linkedError.message });
    const conversationIds = Array.from(
      new Set(
        ((linkedRows ?? []) as Array<{ conversation_id: string }>).map(
          (row) => row.conversation_id,
        ),
      ),
    );
    if (!conversationIds.length) return [];

    const [
      { data: conversations, error: conversationError },
      { data: messages, error: messageError },
    ] = await Promise.all([
      ctx.supabase
        .from("ai_conversations")
        .select("id, title, last_message_at")
        .in("id", conversationIds)
        .is("deleted_at", null),
      ctx.supabase
        .from("ai_messages")
        .select(
          "id, conversation_id, role, content, created_at, input_tokens, output_tokens, metadata",
        )
        .in("conversation_id", conversationIds)
        .neq("role", "system")
        .order("created_at", { ascending: true })
        .limit(500),
    ]);
    if (conversationError)
      throw new ApiError({
        code: "AI_CONVERSATION_LIST_FAILED",
        message: conversationError.message,
      });
    if (messageError)
      throw new ApiError({ code: "AI_MESSAGE_LIST_FAILED", message: messageError.message });

    const rows = (messages ?? []) as Array<any>;
    return ((conversations ?? []) as Array<any>)
      .map((conversation) => ({
        id: conversation.id as string,
        title: conversation.title as string,
        lastMessageAt: conversation.last_message_at as string,
        messages: rows
          .filter((message) => message.conversation_id === conversation.id)
          .map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.created_at,
            inputTokens: message.input_tokens ?? 0,
            outputTokens: message.output_tokens ?? 0,
            metadata: message.metadata ?? null,
          })),
      }))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  });

export const deleteAiConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("ai_conversations")
      .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.userId })
      .eq("id", data.conversationId);
    if (error)
      throw new ApiError({ code: "AI_CONVERSATION_DELETE_FAILED", message: error.message });
    return { ok: true };
  });

export const restoreAiConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("ai_conversations")
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", data.conversationId);
    if (error)
      throw new ApiError({ code: "AI_CONVERSATION_RESTORE_FAILED", message: error.message });
    return { ok: true };
  });

export const purgeAiConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("ai_conversations")
      .delete()
      .eq("id", data.conversationId)
      .not("deleted_at", "is", null);
    if (error) throw new ApiError({ code: "AI_CONVERSATION_PURGE_FAILED", message: error.message });
    return { ok: true };
  });

export const listAiMessageVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ messageId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AiMessageVersionDTO[]> => {
    const ctx = context as unknown as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("ai_message_versions")
      .select("id, version, content, created_at")
      .eq("message_id", data.messageId)
      .order("version", { ascending: false })
      .limit(50);
    if (error)
      throw new ApiError({ code: "AI_MESSAGE_VERSION_LIST_FAILED", message: error.message });
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      version: Number(r.version),
      content: r.content,
      createdAt: r.created_at,
    }));
  });

export const updateAiMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ messageId: z.string().uuid(), content: z.string().min(1).max(20000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("ai_messages")
      .update({ content: data.content })
      .eq("id", data.messageId);
    if (error) throw new ApiError({ code: "AI_MESSAGE_UPDATE_FAILED", message: error.message });
    return { ok: true };
  });

function titleFrom(text: string) {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 60)}…` : t || "Cuộc hội thoại mới";
}

type WorkGraphReportSnapshot = {
  title: string;
  status: string | null;
  dueAt: string | null;
  owner: string | null;
  progress: number;
  completedSteps: number;
  totalSteps: number;
};

async function loadWorkGraphReportSnapshot(
  supabase: any,
  tenantId: string,
  taskId: string | null,
): Promise<WorkGraphReportSnapshot | null> {
  if (!taskId) return null;
  const { data, error } = await supabase.rpc("list_work_graph_board_page", {
    _tenant_id: tenantId,
    _tab: "all",
    _search: undefined,
    _assignee_id: undefined,
    _unassigned: false,
    _due_filter: "all",
    _task_id: taskId,
    _limit: 10,
    _offset: 0,
  });
  if (error) return null;
  const item = (data as { items?: Array<Record<string, unknown>> } | null)?.items?.[0];
  if (!item) return null;

  const ownerId = typeof item["owner_id"] === "string" ? item["owner_id"] : null;
  let owner: string | null = null;
  if (ownerId) {
    const { data: members } = await supabase.rpc("list_tenant_member_profiles", {
      _tenant_id: tenantId,
    });
    const match = (members as Array<Record<string, unknown>> | null)?.find(
      (member) => member["id"] === ownerId,
    );
    owner =
      (typeof match?.["display_name"] === "string" && match["display_name"]) ||
      (typeof match?.["primary_email"] === "string" && match["primary_email"]) ||
      null;
  }

  return {
    title: String(item["title"] ?? "Công việc"),
    status: typeof item["status"] === "string" ? item["status"] : null,
    dueAt: typeof item["due_at"] === "string" ? item["due_at"] : null,
    owner,
    progress: Number(item["progress"] ?? 0),
    completedSteps: Number(item["completed_steps"] ?? 0),
    totalSteps: Number(item["total_steps"] ?? 0),
  };
}

function fallbackFullReport(brief: string, snapshot: WorkGraphReportSnapshot | null): string {
  const progress = snapshot
    ? `${snapshot.progress}% (${snapshot.completedSteps}/${snapshot.totalSteps} bước) — ${snapshot.status ?? "Chưa xác định"}`
    : "Chưa có dữ liệu tiến độ Work Graph.";
  return [
    "# Báo cáo công việc",
    "## Tóm tắt điều hành",
    brief,
    "## Mục tiêu",
    "Chưa xác định ngoài nội dung Executive Brief.",
    "## Chỉ tiêu / KPI",
    "Chưa xác định.",
    "## Kế hoạch hành động",
    "Thực hiện các việc đã nêu trong Executive Brief và cập nhật kết quả theo từng bước.",
    "## Deadline",
    snapshot?.dueAt ?? "Chưa xác định.",
    "## Phân công",
    snapshot?.owner ?? "Chưa xác định.",
    "## Tiến độ Work Graph",
    progress,
    "## Rủi ro và kiến nghị",
    "AI đề xuất: xác nhận KPI, deadline và người phụ trách còn thiếu trước khi thực hiện.",
    "## Nguồn",
    "Executive Brief và ngữ cảnh UNIWORK đã được lọc theo quyền truy cập.",
  ].join("\n\n");
}

export const sendAiMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        conversationId: z.string().uuid().optional(),
        workspaceId: z.string().uuid().optional(),
        text: z.string().min(1).max(8000),
        contextNote: z.string().max(2000).optional(),
        metadata: messageMetadataSchema.optional(),
        rootEntity: z.object({ type: z.enum(WORK_ENTITY_TYPES), id: z.string().uuid() }).optional(),
        /** Add Context: task / decision / document / work product... đính kèm từ composer. */
        contextEntities: z
          .array(
            z.object({
              type: z.enum(WORK_ENTITY_TYPES),
              id: z.string().uuid(),
              label: z.string().max(200).optional(),
            }),
          )
          .max(8)
          .optional(),
      })
      .parse(i),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      conversationId: string;
      reply: string;
      inputTokens: number;
      outputTokens: number;
    }> => {
      const ctx = context as unknown as Ctx;
      const tenantId = await resolveTenant(ctx);
      if (!tenantId)
        throw new ApiError({
          code: "TENANT_CONTEXT_REQUIRED",
          message: "Chưa có tổ chức hoạt động",
        });

      if (data.rootEntity?.type === "TASK") {
        const { data: permissions, error: permissionError } = await ctx.supabase.rpc(
          "get_task_messaging_permissions",
          { _task_id: data.rootEntity.id },
        );
        if (permissionError) throw permissionError;
        if (!permissions?.[0]?.can_ask_uni_ai) {
          throw new ApiError({
            code: "TENANT_ACCESS_DENIED",
            message: "Bạn không có quyền hỏi UNI AI trong công việc này",
          });
        }
      }

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
          throw new ApiError({
            code: "AI_CONVERSATION_NOT_FOUND",
            message: "Không tìm thấy hội thoại",
          });
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
          // Work Graph: lưu thực thể đính kèm cùng tin nhắn để hội thoại tái lập được ngữ cảnh.
          metadata: {
            ...(data.metadata ?? {}),
            ...(data.contextEntities?.length ? { contextEntities: data.contextEntities } : {}),
          },
        })
        .select("id")
        .single();

      // 3. Build history
      const { data: history } = await ctx.supabase
        .from("ai_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      const started = Date.now();
      let reply = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let status = "succeeded";
      let errorMessage: string | null = null;
      let sourceMetadata: NonNullable<AiMessageMetadata["sources"]> = [];
      let reportContent = "";
      let reportSnapshot: WorkGraphReportSnapshot | null = null;
      let contextPack: AiContextPack | null = null;

      try {
        const { answerWithContext } = await import("./ai-consumer.server");
        const conversation = ((history ?? []) as Array<{ role: string; content: string }>)
          .map(
            (m) => `${m.role === "assistant" ? "UNI" : "Người dùng"}: ${m.content.slice(0, 1200)}`,
          )
          .join("\n");
        const result = await answerWithContext(
          ctx.supabase,
          ctx.userId,
          getCookie(ACTIVE_TENANT_COOKIE) ?? null,
          {
            consumer: "MY_AI",
            query: data.text,
            workspaceId,
            rootEntity: data.rootEntity ?? null,
            pinnedEntities:
              data.contextEntities?.map((item) => ({ type: item.type, id: item.id })) ?? null,
            systemRole: SYSTEM_PROMPT,
            promptSections: [
              conversation ? `HỘI THOẠI GẦN ĐÂY:\n${conversation}` : "",
              data.contextNote ? `NGỮ CẢNH NGƯỜI DÙNG ĐÃ THÊM:\n${data.contextNote}` : "",
              `YÊU CẦU HIỆN TẠI:\n${data.text}`,
            ],
          },
        );
        reply = result.text.trim();
        if (!reply) throw new Error("AI không trả về nội dung.");
        inputTokens = result.usage?.inputTokens ?? 0;
        outputTokens = result.usage?.outputTokens ?? 0;
        sourceMetadata = result.sources.slice(0, 8).map((source) => ({
          sourceId: source.sourceId,
          entityType: source.entityType,
          entityId: source.entityId,
          title: source.title,
          href: source.href,
          updatedAt: source.updatedAt,
        }));
        contextPack = result.pack;

        const taskId =
          data.rootEntity?.type === "TASK"
            ? data.rootEntity.id
            : (sourceMetadata.find((source) => source.entityType === "TASK")?.entityId ?? null);
        reportSnapshot = await loadWorkGraphReportSnapshot(ctx.supabase, tenantId, taskId);
        try {
          const fullReport = await answerWithContext(
            ctx.supabase,
            ctx.userId,
            getCookie(ACTIVE_TENANT_COOKIE) ?? null,
            {
              consumer: "MY_AI",
              query: data.text,
              workspaceId,
              rootEntity: data.rootEntity ?? null,
              pinnedEntities:
                data.contextEntities?.map((item) => ({ type: item.type, id: item.id })) ?? null,
              systemRole: FULL_REPORT_SYSTEM_PROMPT,
              prebuiltPack: contextPack,
              promptSections: [
                `YÊU CẦU GỐC:\n${data.text}`,
                `EXECUTIVE BRIEF ĐÃ XÁC NHẬN:\n${reply}`,
                reportSnapshot
                  ? `ẢNH CHỤP TIẾN ĐỘ WORK GRAPH:\n${JSON.stringify(reportSnapshot)}`
                  : "ẢNH CHỤP TIẾN ĐỘ WORK GRAPH: Chưa có dữ liệu.",
              ],
            },
          );
          reportContent = fullReport.text.trim();
          inputTokens += fullReport.usage?.inputTokens ?? 0;
          outputTokens += fullReport.usage?.outputTokens ?? 0;
        } catch {
          reportContent = fallbackFullReport(reply, reportSnapshot);
        }
      } catch (e) {
        status = "failed";
        errorMessage = e instanceof Error ? e.message : String(e);
      }

      // 4. Persist assistant message
      let assistantMessageId: string | null = null;
      if (status === "succeeded") {
        const { data: aMsg, error: assistantError } = await ctx.supabase
          .from("ai_messages")
          .insert({
            tenant_id: tenantId,
            conversation_id: conversationId,
            role: "assistant",
            content: reply || "(Không có nội dung trả về)",
            model: MODEL,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            metadata: {
              source: "NATIVE_AI",
              workspaceId,
              sources: sourceMetadata,
            },
          })
          .select("id")
          .single();
        if (assistantError || !aMsg) {
          throw new ApiError({
            code: "AI_GENERATION_FAILED",
            message: assistantError?.message ?? "Không lưu được phản hồi AI",
          });
        }
        assistantMessageId = (aMsg?.id as string) ?? null;

        // Persist the exact Executive Brief without another model call. The RPC owns
        // idempotency, tenant checks, source links, outbox emission and graph projection.
        const root = data.rootEntity;
        const supportedRoot =
          root && ["WORKSPACE", "MEETING", "TASK", "DOCUMENT", "EMAIL"].includes(root.type)
            ? root
            : null;
        const { error: workProductError } = await ctx.supabase.rpc("persist_chat_executive_brief", {
          _assistant_message_id: assistantMessageId,
          _title: `${titleFrom(data.text)} — Executive Brief`,
          _report_content: reportContent || fallbackFullReport(reply, reportSnapshot),
          _report_metadata: {
            generator: "executive-report-v1",
            executiveBrief: reply,
            workGraph: reportSnapshot,
            sourceCount: sourceMetadata.length,
          },
          _root_type: supportedRoot?.type ?? null,
          _root_id: supportedRoot?.id ?? null,
          _sources: sourceMetadata,
          _idempotency_key: `chat-executive-brief:${assistantMessageId}`,
          _correlation_id: conversationId,
        });
        if (workProductError) {
          await ctx.supabase
            .from("ai_messages")
            .update({
              metadata: {
                source: "NATIVE_AI",
                workspaceId,
                sources: sourceMetadata,
                workProductStatus: "FAILED",
                workProductError: workProductError.message.slice(0, 500),
              },
            })
            .eq("id", assistantMessageId);
        }
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
        run_id: null,
        status,
        error_message: errorMessage,
      });

      if (status !== "succeeded")
        throw new ApiError({ code: "AI_GENERATION_FAILED", message: errorMessage ?? "AI lỗi" });

      if (!conversationId) {
        throw new ApiError({
          code: "AI_CONVERSATION_NOT_FOUND",
          message: "Không tìm thấy hội thoại",
        });
      }
      return { conversationId, reply, inputTokens, outputTokens };
    },
  );

export type AiUsageSummary = {
  totalTokens: number;
  totalRequests: number;
  byWorkspace: Array<{
    workspaceId: string | null;
    workspaceName: string;
    tokens: number;
    requests: number;
  }>;
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
export type AiUsageBucketDTO = {
  bucket: string; // ISO date của mốc ngày/tuần
  label: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  durationMs: number;
};

export type AiUsageWorkspaceSeriesDTO = {
  workspaceId: string | null;
  workspaceName: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  durationMs: number;
  buckets: AiUsageBucketDTO[];
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // thứ 2 đầu tuần
  x.setDate(x.getDate() - day);
  return x;
}

export const getAiUsageTimeseries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        granularity: z.enum(["day", "week"]).default("day"),
        days: z.number().int().min(1).max(180).default(14),
        workspaceId: z.string().uuid().optional(),
      })
      .default({ granularity: "day", days: 14 })
      .parse(i ?? {}),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      granularity: "day" | "week";
      buckets: string[];
      totals: {
        tokens: number;
        inputTokens: number;
        outputTokens: number;
        requests: number;
        durationMs: number;
      };
      workspaces: AiUsageWorkspaceSeriesDTO[];
    }> => {
      const ctx = context as unknown as Ctx;
      const empty = {
        granularity: data.granularity,
        buckets: [] as string[],
        totals: { tokens: 0, inputTokens: 0, outputTokens: 0, requests: 0, durationMs: 0 },
        workspaces: [] as AiUsageWorkspaceSeriesDTO[],
      };
      const tenantId = await resolveTenant(ctx);
      if (!tenantId) return empty;
      const wsList = await listWorkspaces(ctx, tenantId);
      const wsMap = new Map(wsList.map((w) => [w.id, w.name]));

      const since = startOfDay(new Date());
      since.setDate(since.getDate() - (data.days - 1));
      const from = data.granularity === "week" ? startOfWeek(since) : since;

      let q = ctx.supabase
        .from("ai_usage_events")
        .select("workspace_id, input_tokens, output_tokens, total_tokens, duration_ms, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", from.toISOString())
        .order("created_at", { ascending: true })
        .limit(5000);
      if (data.workspaceId) q = q.eq("workspace_id", data.workspaceId);
      const { data: rows, error } = await q;
      if (error)
        throw new ApiError({ code: "AI_CONVERSATION_LIST_FAILED", message: error.message });

      // Danh sách mốc thời gian liên tục để biểu đồ không bị đứt quãng.
      const bucketKeys: string[] = [];
      const cursor = new Date(from);
      const now = new Date();
      while (cursor <= now) {
        bucketKeys.push(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + (data.granularity === "week" ? 7 : 1));
      }

      const seriesMap = new Map<string, AiUsageWorkspaceSeriesDTO>();
      const totals = { tokens: 0, inputTokens: 0, outputTokens: 0, requests: 0, durationMs: 0 };

      const makeSeries = (key: string): AiUsageWorkspaceSeriesDTO => ({
        workspaceId: key === "none" ? null : key,
        workspaceName: key === "none" ? "Không thuộc workspace" : (wsMap.get(key) ?? "Workspace"),
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
        durationMs: 0,
        buckets: bucketKeys.map((b) => ({
          bucket: b,
          label:
            data.granularity === "week"
              ? `Tuần ${new Date(b).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`
              : new Date(b).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          requests: 0,
          durationMs: 0,
        })),
      });

      for (const r of (rows ?? []) as Array<{
        workspace_id: string | null;
        input_tokens: number | null;
        output_tokens: number | null;
        total_tokens: number | null;
        duration_ms: number | null;
        created_at: string;
      }>) {
        const created = new Date(r.created_at);
        const bucketDate = data.granularity === "week" ? startOfWeek(created) : startOfDay(created);
        const bucketKey = bucketDate.toISOString().slice(0, 10);
        const key = r.workspace_id ?? "none";
        const series = seriesMap.get(key) ?? makeSeries(key);
        seriesMap.set(key, series);
        const slot = series.buckets.find((b) => b.bucket === bucketKey);
        const input = Number(r.input_tokens ?? 0);
        const output = Number(r.output_tokens ?? 0);
        const total = Number(r.total_tokens ?? input + output);
        const dur = Number(r.duration_ms ?? 0);
        if (slot) {
          slot.tokens += total;
          slot.inputTokens += input;
          slot.outputTokens += output;
          slot.requests += 1;
          slot.durationMs += dur;
        }
        series.tokens += total;
        series.inputTokens += input;
        series.outputTokens += output;
        series.requests += 1;
        series.durationMs += dur;
        totals.tokens += total;
        totals.inputTokens += input;
        totals.outputTokens += output;
        totals.requests += 1;
        totals.durationMs += dur;
      }

      return {
        granularity: data.granularity,
        buckets: bucketKeys,
        totals,
        workspaces: Array.from(seriesMap.values()).sort((a, b) => b.tokens - a.tokens),
      };
    },
  );

// Xuất danh sách hội thoại đã lọc kèm số tin nhắn + usage minutes
export const exportAiConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid().optional(),
        q: z.string().max(200).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        deleted: z.boolean().optional(),
        sort: z
          .enum(["recent", "oldest", "created_desc", "created_asc", "usage_desc", "usage_asc"])
          .optional(),
      })
      .optional()
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<AiConversationExportRow[]> => {
    const ctx = context as unknown as Ctx;
    const tenantId = await resolveTenant(ctx);
    if (!tenantId) return [];
    const workspaces = await listWorkspaces(ctx, tenantId);
    const sortSpec: Record<string, { col: string; asc: boolean }> = {
      recent: { col: "last_message_at", asc: false },
      oldest: { col: "last_message_at", asc: true },
      created_desc: { col: "created_at", asc: false },
      created_asc: { col: "created_at", asc: true },
      usage_desc: { col: "total_output_tokens", asc: false },
      usage_asc: { col: "total_output_tokens", asc: true },
    };
    const { col, asc } = sortSpec[data?.sort ?? "recent"]!;
    let q = ctx.supabase
      .from("ai_conversations")
      .select(
        "id, title, workspace_id, model, total_input_tokens, total_output_tokens, last_message_at, created_at, deleted_at",
      )
      .eq("tenant_id", tenantId)
      .order(col, { ascending: asc, nullsFirst: false })
      .limit(1000);
    q = data?.deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    if (data?.workspaceId) q = q.eq("workspace_id", data.workspaceId);
    const term = data?.q?.trim();
    if (term) q = q.ilike("title", `%${term.replace(/[%_]/g, "")}%`);
    if (data?.from) q = q.gte("last_message_at", new Date(data.from).toISOString());
    if (data?.to) {
      const end = new Date(data.to);
      end.setHours(23, 59, 59, 999);
      q = q.lte("last_message_at", end.toISOString());
    }
    const { data: rows, error } = await q;
    if (error) throw new ApiError({ code: "AI_CONVERSATION_LIST_FAILED", message: error.message });
    const list = (rows ?? []) as any[];
    const ids = list.map((r) => r.id);
    const counts = new Map<string, number>();
    const durations = new Map<string, number>();
    const tokens = new Map<string, number>();
    if (ids.length > 0) {
      const { data: msgs } = await ctx.supabase
        .from("ai_messages")
        .select("conversation_id")
        .in("conversation_id", ids);
      for (const m of (msgs ?? []) as Array<{ conversation_id: string }>)
        counts.set(m.conversation_id, (counts.get(m.conversation_id) ?? 0) + 1);
      const { data: usage } = await ctx.supabase
        .from("ai_usage_events")
        .select("conversation_id, duration_ms, total_tokens")
        .in("conversation_id", ids);
      for (const u of (usage ?? []) as Array<{
        conversation_id: string;
        duration_ms: number | null;
        total_tokens: number | null;
      }>) {
        durations.set(
          u.conversation_id,
          (durations.get(u.conversation_id) ?? 0) + (u.duration_ms ?? 0),
        );
        tokens.set(u.conversation_id, (tokens.get(u.conversation_id) ?? 0) + (u.total_tokens ?? 0));
      }
    }
    const wsMap = new Map(workspaces.map((w) => [w.id, w.name]));
    return list.map((r) => {
      const inTok = Number(r.total_input_tokens ?? 0);
      const outTok = Number(r.total_output_tokens ?? 0);
      return {
        id: r.id,
        title: r.title,
        workspaceId: r.workspace_id,
        workspaceName: r.workspace_id ? (wsMap.get(r.workspace_id) ?? null) : null,
        model: r.model,
        totalInputTokens: inTok,
        totalOutputTokens: outTok,
        lastMessageAt: r.last_message_at,
        createdAt: r.created_at,
        deletedAt: r.deleted_at ?? null,
        messageCount: counts.get(r.id) ?? 0,
        usageMinutes: Math.round(((durations.get(r.id) ?? 0) / 60000) * 100) / 100,
        totalTokens: tokens.get(r.id) || inTok + outTok,
      };
    });
  });
