// UniWork Chat — Conversation to Work.
// Nhập hội thoại thủ công, rút trích công việc bằng AI, duyệt tạo bản ghi thật,
// và truy vết nguồn. Mọi thao tác đi qua RPC SECURITY DEFINER, tenant/RLS áp dụng.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Ctx = { supabase: any; userId: string };

async function currentTenantId(supabase: any, userId: string, workspaceId?: string | null) {
  const { resolveTenantId } = await import("./work-deliverables.server");
  const { readActiveTenantCookie } = await import("./active-tenant.server");
  return resolveTenantId(supabase, userId, workspaceId ?? null, readActiveTenantCookie());
}

const sourceTypeSchema = z.enum(["CHAT_CHANNEL", "IMPORT"]);
const channelSchema = z.enum(["zalo", "whatsapp", "telegram", "viber", "other"]);

export type ConversationSourceMessage = {
  id: string;
  seq: number;
  author: string;
  sentAt: string | null;
  body: string;
  attachments: Array<{ name?: string; url?: string; size?: number | null }>;
};

export type ConversationSource = {
  sourceType: "CHAT_CHANNEL" | "IMPORT";
  sourceId: string;
  tenantId: string;
  workspaceId: string | null;
  title: string;
  channel: string;
  ingestMode: string;
  sharedBy?: string | null;
  importedBy?: string | null;
  originalAt?: string | null;
  visibility?: string | null;
  messageCount: number;
};

export type ExtractionProposalDTO = {
  id: string;
  runId: string;
  kind: "TASK" | "DECISION" | "COMMITMENT" | "KNOWLEDGE";
  title: string;
  description: string | null;
  evidence: string;
  confidence: number;
  missingFields: string[];
  status: "PENDING" | "APPROVED" | "DISMISSED";
  createdEntityType: string | null;
  createdEntityId: string | null;
};

async function sha256Hex(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------- Save to UniWork (import) ------------------------- */

const importMessageSchema = z.object({
  authorLabel: z.string().max(200).nullish(),
  sentAt: z.string().datetime({ offset: true }).nullish(),
  body: z.string().min(1).max(20000),
  attachments: z
    .array(z.object({ name: z.string().max(300), url: z.string().max(2000), size: z.number().nullish() }))
    .max(20)
    .default([]),
});

export const saveConversationImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid().nullish(),
        sourceChannel: channelSchema,
        sourceGroupName: z.string().min(1).max(200),
        sharedByLabel: z.string().max(200).nullish(),
        originalAt: z.string().datetime({ offset: true }).nullish(),
        visibility: z.enum(["PRIVATE", "TENANT"]).default("TENANT"),
        notes: z.string().max(2000).nullish(),
        messages: z.array(importMessageSchema).min(1).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const tenantId = await currentTenantId(ctx.supabase, ctx.userId, data.workspaceId);
    const fingerprint = await sha256Hex(
      [
        data.sourceChannel,
        data.sourceGroupName.trim().toLowerCase(),
        ...data.messages.map((m) => `${m.authorLabel ?? ""}|${m.body.trim()}`),
      ].join("\n"),
    );

    const { data: res, error } = await ctx.supabase.rpc("create_conversation_import", {
      _tenant_id: tenantId,
      _workspace_id: data.workspaceId ?? null,
      _source_channel: data.sourceChannel,
      _source_group_name: data.sourceGroupName.trim(),
      _shared_by_label: data.sharedByLabel ?? null,
      _original_at: data.originalAt ?? null,
      _visibility: data.visibility,
      _notes: data.notes ?? null,
      _fingerprint: fingerprint,
      _messages: data.messages.map((m) => ({
        authorLabel: m.authorLabel ?? null,
        sentAt: m.sentAt ?? null,
        body: m.body,
        attachments: m.attachments,
      })),
    });
    if (error) mapPgError(error, "VALIDATION_FAILED");
    return res as { importId: string; duplicate: boolean; messageCount: number };
  });

export type ConversationImportDTO = {
  id: string;
  channel: string;
  groupName: string;
  sharedBy: string | null;
  originalAt: string | null;
  messageCount: number;
  visibility: string;
  ingestMode: string;
  createdAt: string;
  importedBy: string;
};

export const listConversationImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ limit: z.number().int().min(1).max(50).default(20), search: z.string().max(200).nullish() })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<ConversationImportDTO[]> => {
    const ctx = context as unknown as Ctx;
    const tenantId = await currentTenantId(ctx.supabase, ctx.userId);
    let q = ctx.supabase
      .from("conversation_imports")
      .select(
        "id, source_channel, source_group_name, shared_by_label, original_at, message_count, visibility, ingest_mode, created_at, imported_by",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.search) q = q.ilike("source_group_name", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      channel: r.source_channel as string,
      groupName: r.source_group_name as string,
      sharedBy: (r.shared_by_label as string | null) ?? null,
      originalAt: (r.original_at as string | null) ?? null,
      messageCount: r.message_count as number,
      visibility: r.visibility as string,
      ingestMode: r.ingest_mode as string,
      createdAt: r.created_at as string,
      importedBy: r.imported_by as string,
    }));
  });

/* ------------------------------ Read a source ------------------------------ */

export const getConversationSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        sourceType: sourceTypeSchema,
        sourceId: z.string().uuid(),
        limit: z.number().int().min(1).max(300).default(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: res, error } = await ctx.supabase.rpc("get_conversation_source", {
      _source_type: data.sourceType,
      _source_id: data.sourceId,
      _limit: data.limit,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    const payload = res as { source: ConversationSource; messages: ConversationSourceMessage[] };
    return payload;
  });

/* ------------------------------ Extract work ------------------------------- */

async function loadSource(ctx: Ctx, sourceType: string, sourceId: string) {
  const { data: res, error } = await ctx.supabase.rpc("get_conversation_source", {
    _source_type: sourceType,
    _source_id: sourceId,
    _limit: 200,
  });
  if (error) mapPgError(error, "PERMISSION_DENIED");
  return res as { source: ConversationSource; messages: ConversationSourceMessage[] };
}

export const extractWorkFromConversationSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ sourceType: sourceTypeSchema, sourceId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ApiError({ code: "VALIDATION_FAILED", message: "AI_NOT_CONFIGURED" });

    const { source, messages } = await loadSource(ctx, data.sourceType, data.sourceId);
    if (!messages.length) throw new ApiError({ code: "VALIDATION_FAILED", message: "CONVERSATION_EMPTY" });

    const { extractWorkFromConversation } = await import("./conversation-extract.server");
    const proposals = await extractWorkFromConversation({
      apiKey,
      title: source.title,
      channel: source.channel,
      messages: messages.map((m) => ({ id: m.id, author: m.author, sentAt: m.sentAt, body: m.body })),
    });

    const idempotencyKey = await sha256Hex(
      `${data.sourceType}:${data.sourceId}:${messages.length}:${messages.at(-1)?.id ?? ""}`,
    );

    const { data: run, error } = await ctx.supabase.rpc("record_extraction_run", {
      _tenant_id: source.tenantId,
      _source_type: data.sourceType,
      _source_id: data.sourceId,
      _workspace_id: source.workspaceId ?? null,
      _idempotency_key: idempotencyKey,
      _model: "openai/gpt-6-astra",
      _proposals: proposals,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    const runId = (run as { runId: string }).runId;
    return { runId, duplicate: (run as { duplicate: boolean }).duplicate };
  });

export const listExtractionProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        runId: z.string().uuid().nullish(),
        sourceType: sourceTypeSchema.nullish(),
        sourceId: z.string().uuid().nullish(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<ExtractionProposalDTO[]> => {
    const ctx = context as unknown as Ctx;
    let runId = data.runId ?? null;
    if (!runId && data.sourceType && data.sourceId) {
      const { data: run } = await ctx.supabase
        .from("work_extraction_runs")
        .select("id")
        .eq("source_type", data.sourceType)
        .eq("source_id", data.sourceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      runId = (run?.id as string | undefined) ?? null;
    }
    if (!runId) return [];
    const { data: rows, error } = await ctx.supabase
      .from("work_extraction_proposals")
      .select(
        "id, run_id, kind, title, description, evidence, confidence, missing_fields, status, created_entity_type, created_entity_id",
      )
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      runId: r.run_id,
      kind: r.kind,
      title: r.title,
      description: r.description ?? null,
      evidence: r.evidence ?? "",
      confidence: Number(r.confidence ?? 0),
      missingFields: (r.missing_fields as string[]) ?? [],
      status: r.status,
      createdEntityType: r.created_entity_type ?? null,
      createdEntityId: r.created_entity_id ?? null,
    }));
  });

/* ------------------------------ Approve flow ------------------------------- */

export const dismissExtractionProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ proposalId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase.rpc("dismiss_extraction_proposal", { _proposal_id: data.proposalId });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });

export const approveExtractionProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        proposalId: z.string().uuid(),
        title: z.string().min(1).max(500),
        description: z.string().max(10000).nullish(),
        workspaceId: z.string().uuid().nullish(),
        assigneeId: z.string().uuid().nullish(),
        dueAt: z.string().datetime({ offset: true }).nullish(),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: proposal, error: pErr } = await ctx.supabase
      .from("work_extraction_proposals")
      .select("id, kind, tenant_id, run_id, evidence, status, created_entity_id")
      .eq("id", data.proposalId)
      .maybeSingle();
    if (pErr) mapPgError(pErr, "PERMISSION_DENIED");
    if (!proposal) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "PROPOSAL_NOT_FOUND" });
    if (proposal.status === "APPROVED") {
      return { entityType: "EXISTING", entityId: proposal.created_entity_id as string };
    }

    const { data: run } = await ctx.supabase
      .from("work_extraction_runs")
      .select("source_type, source_id, workspace_id")
      .eq("id", proposal.run_id)
      .maybeSingle();

    const workspaceId = data.workspaceId ?? (run?.workspace_id as string | null) ?? null;
    const kind = proposal.kind as ExtractionProposalDTO["kind"];
    let entityType: "TASK" | "DECISION" | "KNOWLEDGE" | "COMMITMENT" = "TASK";
    let entityId: string | null = null;

    if (kind === "TASK" || kind === "COMMITMENT") {
      if (!workspaceId) throw new ApiError({ code: "VALIDATION_FAILED", message: "WORKSPACE_REQUIRED" });
      const { data: created, error } = await ctx.supabase.rpc("create_task", {
        _workspace_id: workspaceId,
        _title: data.title.trim(),
        _description: data.description ?? undefined,
        _priority: data.priority,
        _due_at: data.dueAt ?? undefined,
        _assignee_id: data.assigneeId ?? undefined,
        _idempotency_key: `extract:${proposal.id}`,
      });
      if (error) mapPgError(error, "TASK_NOT_FOUND");
      const row = Array.isArray(created) ? created[0] : created;
      entityId = (row as any)?.id ?? null;
      entityType = kind === "COMMITMENT" ? "COMMITMENT" : "TASK";
      if (entityId && kind === "COMMITMENT") {
        await ctx.supabase.rpc("set_task_tags", { _task_id: entityId, _tags: ["commitment"] });
      }
    } else if (kind === "DECISION") {
      const { data: created, error } = await ctx.supabase
        .from("decisions")
        .insert({
          tenant_id: proposal.tenant_id,
          workspace_id: workspaceId,
          title: data.title.trim().slice(0, 200),
          detail: (data.description ?? "").trim() || null,
          status: "CANDIDATE",
          origin: "CHAT",
          source_type: run?.source_type ?? null,
          source_id: run?.source_id ?? null,
          decided_by: ctx.userId,
          created_by: ctx.userId,
          updated_by: ctx.userId,
          evidence: { excerpt: proposal.evidence, channel: "CONVERSATION_TO_WORK" },
        })
        .select("id")
        .single();
      if (error) mapPgError(error, "VALIDATION_FAILED");
      entityId = created?.id ?? null;
      entityType = "DECISION";
    } else {
      const slug = `hoi-thoai-${proposal.id.slice(0, 8)}`;
      const { data: created, error } = await ctx.supabase
        .from("knowledge_articles")
        .insert({
          tenant_id: proposal.tenant_id,
          slug,
          title: data.title.trim(),
          summary: (data.description ?? "").slice(0, 500),
          content: `${data.description ?? ""}\n\n> ${proposal.evidence}`.trim(),
          category: "guide",
          tags: ["conversation"],
          status: "draft",
          created_by: ctx.userId,
          updated_by: ctx.userId,
        })
        .select("id")
        .single();
      if (error) mapPgError(error, "VALIDATION_FAILED");
      entityId = created?.id ?? null;
      entityType = "KNOWLEDGE";
    }

    if (!entityId) throw new ApiError({ code: "VALIDATION_FAILED", message: "ENTITY_NOT_CREATED" });

    const { error: aErr } = await ctx.supabase.rpc("approve_extraction_proposal", {
      _proposal_id: proposal.id,
      _entity_type: entityType,
      _entity_id: entityId,
      _excerpt: proposal.evidence,
    });
    if (aErr) mapPgError(aErr, "PERMISSION_DENIED");

    // Nối vào Work Graph hiện có khi nguồn là hội thoại nội bộ.
    if (run?.source_type === "CHAT_CHANNEL" && (entityType === "TASK" || entityType === "COMMITMENT")) {
      await ctx.supabase.rpc("link_work_entities", {
        _source_type: "TASK",
        _source_id: entityId,
        _target_type: "CHAT_CHANNEL",
        _target_id: run.source_id,
        _relationship: "DISCUSSED_IN",
        _metadata: { origin: "CONVERSATION_TO_WORK" },
      });
    }

    return { entityType, entityId };
  });

/* --------------------------- Source citations ------------------------------ */

export const listWorkSourceCitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        entityType: z.enum(["TASK", "DECISION", "KNOWLEDGE", "COMMITMENT"]),
        entityId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("work_source_citations")
      .select("id, source_type, source_id, excerpt, created_at")
      .eq("entity_type", data.entityType)
      .eq("entity_id", data.entityId)
      .order("created_at", { ascending: false });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      sourceType: r.sourceType ?? (r.source_type as string),
      sourceId: r.source_id as string,
      excerpt: r.excerpt as string,
      createdAt: r.created_at as string,
    }));
  });

/* ------------------------ Conversation Intelligence ------------------------ */

export const askConversationIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        sourceType: sourceTypeSchema,
        sourceId: z.string().uuid(),
        question: z.string().min(1).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ApiError({ code: "VALIDATION_FAILED", message: "AI_NOT_CONFIGURED" });
    const { source, messages } = await loadSource(ctx, data.sourceType, data.sourceId);
    if (!messages.length) return { answer: "Hội thoại chưa có nội dung.", citations: [] };
    const { answerConversationQuestion } = await import("./conversation-extract.server");
    return answerConversationQuestion({
      apiKey,
      question: data.question,
      title: source.title,
      messages: messages.map((m) => ({ id: m.id, author: m.author, sentAt: m.sentAt, body: m.body })),
    });
  });

/* ---------------------- External messaging connections --------------------- */

export type MessagingConnectionDTO = {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  capabilities: { manualImport: boolean; receive: boolean; reply: boolean; groupSupport: boolean };
  lastHealthAt: string | null;
  lastError: string | null;
};

export const listMessagingConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MessagingConnectionDTO[]> => {
    const ctx = context as unknown as Ctx;
    const tenantId = await currentTenantId(ctx.supabase, ctx.userId);
    const { data: rows, error } = await ctx.supabase
      .from("external_messaging_connections")
      .select("id, provider, display_name, status, capabilities, last_health_at, last_error")
      .eq("tenant_id", tenantId)
      .order("provider", { ascending: true });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      provider: r.provider,
      displayName: r.display_name,
      status: r.status,
      capabilities: {
        manualImport: Boolean(r.capabilities?.manualImport ?? true),
        receive: Boolean(r.capabilities?.receive),
        reply: Boolean(r.capabilities?.reply),
        groupSupport: Boolean(r.capabilities?.groupSupport),
      },
      lastHealthAt: r.last_health_at ?? null,
      lastError: r.last_error ?? null,
    }));
  });
