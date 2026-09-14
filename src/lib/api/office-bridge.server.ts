// GO-2C Office Bridge — lõi server-only.
// Không bao giờ lộ khoá dịch vụ, token khởi chạy hay nội dung tài liệu ra ngoài/nhật ký.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const DOCUMENTS_BUCKET = "documents";
export const LAUNCH_TTL_MS = 2 * 60 * 1000; // token khởi chạy 2 phút
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // phiên Office 8 giờ

export type OfficeExt = "docx" | "xlsx" | "pptx" | "pdf";

export const SUPPORTED_MIME: Record<OfficeExt, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
};

export function extOf(name: string | null | undefined): OfficeExt | null {
  const m = /\.([a-z0-9]+)$/i.exec((name ?? "").trim());
  const e = m?.[1]?.toLowerCase();
  return e === "docx" || e === "xlsx" || e === "pptx" || e === "pdf" ? e : null;
}

export type StorageRef = { provider?: string; bucket: string; objectKey: string };

export function asStorageRef(v: unknown): StorageRef | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r["bucket"] !== "string" || typeof r["objectKey"] !== "string") return null;
  return { bucket: r["bucket"], objectKey: r["objectKey"] };
}

export function fileNameOfRef(ref: StorageRef | null): string | null {
  if (!ref) return null;
  const last = ref.objectKey.split("/").pop() ?? "";
  return last.replace(/^\d+-/, "") || null;
}

// ---------- token ----------

export function newOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------- lỗi chuẩn hoá ----------

export class OfficeError extends Error {
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.status = status;
  }
}

export function officeJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function officeFail(e: unknown) {
  if (e instanceof OfficeError) return officeJson({ ok: false, error: e.message }, e.status);
  // Chỉ ghi mã lỗi, tuyệt đối không ghi token hay nội dung.
  console.error("[office-bridge] unexpected_error");
  return officeJson({ ok: false, error: "INTERNAL_ERROR" }, 500);
}

// ---------- clients ----------

export async function adminClient(): Promise<SupabaseClient<Database>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient<Database>;
}

/** Xác thực người dùng UniWork qua bearer Supabase (RLS áp dụng cho client trả về). */
export async function authenticateUser(request: Request) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new OfficeError("SERVER_MISCONFIGURED", 500);
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) throw new OfficeError("UNAUTHORIZED", 401);
  const token = header.slice(7).trim();
  if (!token) throw new OfficeError("UNAUTHORIZED", 401);
  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) throw new OfficeError("UNAUTHORIZED", 401);
  return { supabase, userId: userId as string };
}

export type OfficeSessionRow = Database["public"]["Tables"]["office_sessions"]["Row"];

/** Xác thực chứng thư phiên Office (chỉ có hiệu lực cho đúng phiên/tài liệu). */
export async function authenticateOfficeSession(request: Request): Promise<{
  admin: SupabaseClient<Database>;
  session: OfficeSessionRow;
}> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new OfficeError("UNAUTHORIZED", 401);
  const admin = await adminClient();
  const hash = await hashToken(token);
  const { data } = await admin
    .from("office_sessions")
    .select("*")
    .eq("session_token_hash", hash)
    .maybeSingle();
  if (!data) throw new OfficeError("UNAUTHORIZED", 401);
  if (data.status !== "ACTIVE") throw new OfficeError("SESSION_NOT_ACTIVE", 401);
  if (!data.session_expires_at || new Date(data.session_expires_at).getTime() < Date.now()) {
    await admin.from("office_sessions").update({ status: "EXPIRED" }).eq("id", data.id);
    throw new OfficeError("SESSION_EXPIRED", 401);
  }
  return { admin, session: data };
}

/**
 * Kiểm tra lại quyền của người dùng với tài liệu ở phía máy chủ (không tin client).
 * Bám theo đúng chính sách RLS documents_member_select.
 */
export async function actorCanAccessDocument(
  admin: SupabaseClient<Database>,
  userId: string,
  doc: { id: string; tenant_id: string; workspace_id: string; created_by: string | null },
): Promise<boolean> {
  const { data: member } = await admin
    .from("tenant_members")
    .select("id, status")
    .eq("tenant_id", doc.tenant_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!member) return false;
  if (doc.created_by === userId) return true;

  const { data: ws } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", doc.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (ws) return true;

  const { data: perms } = await admin
    .from("document_permissions")
    .select("principal_type, principal_id")
    .eq("document_id", doc.id);
  for (const p of perms ?? []) {
    if (p.principal_type === "user" && p.principal_id === userId) return true;
    if (p.principal_type === "workspace") {
      const { data: m } = await admin
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", p.principal_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (m) return true;
    }
  }
  return false;
}

/** Phiên bản mới nhất thực tế của tài liệu. */
export async function latestVersion(
  admin: SupabaseClient<Database>,
  documentId: string,
): Promise<number> {
  const { data } = await admin
    .from("document_versions")
    .select("version")
    .eq("document_id", documentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.version ?? 0);
}

/** Ghi nhật ký truy cập tài liệu (không ghi token, không ghi nội dung). */
export async function logDocumentAccess(
  admin: SupabaseClient<Database>,
  input: {
    tenantId: string;
    workspaceId: string;
    documentId: string;
    documentTitle?: string | null;
    actorId: string;
    action: "view" | "download" | "export";
    version?: number | null;
    context?: Record<string, unknown>;
  },
) {
  try {
    await admin.from("document_access_logs").insert({
      tenant_id: input.tenantId,
      workspace_id: input.workspaceId,
      document_id: input.documentId,
      document_title: input.documentTitle ?? null,
      actor_id: input.actorId,
      action: input.action,
      version: input.version ?? null,
      context: (input.context ?? {}) as never,
    });
  } catch {
    /* nhật ký không được chặn nghiệp vụ */
  }
}

/** Phát sự kiện qua outbox có sẵn (không tạo consumer mới). */
export async function emitOutbox(
  admin: SupabaseClient<Database>,
  input: {
    tenantId: string;
    eventType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  },
) {
  try {
    await admin.rpc("_emit_outbox_event", {
      _tenant_id: input.tenantId,
      _event_type: input.eventType,
      _aggregate_type: "document",
      _aggregate_id: input.aggregateId,
      _payload: input.payload as never,
      _idempotency_key: input.idempotencyKey ?? null,
    } as never);
  } catch {
    /* outbox lỗi không được làm hỏng phiên bản đã ghi */
  }
}

export function originOf(request: Request): string {
  return new URL(request.url).origin;
}
