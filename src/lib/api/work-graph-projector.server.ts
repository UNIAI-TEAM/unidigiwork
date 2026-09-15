import type { SupabaseClient } from "@supabase/supabase-js";
import { isSkippableGraphError, normalizeDocumentVersionPayload } from "@/domain/work-graph/go3-mapping";

export type GraphProjectionResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  documentId?: string;
  workProductId?: string;
  latestVersion?: number;
  latestBusinessVersion?: number;
};

export function classifyProjectionResult(row: GraphProjectionResult): GraphProjectionResult {
  if (row.ok) return { ...row, skipped: false };
  if (row.error && isSkippableGraphError(row.error)) {
    return { ...row, skipped: true };
  }
  return { ...row, skipped: false };
}

export async function projectDocumentVersionUploaded(
  admin: SupabaseClient,
  tenantId: string | null,
  payload: Record<string, unknown> | null,
): Promise<GraphProjectionResult> {
  const { data, error } = await admin.rpc("project_document_version_uploaded" as never, {
    _tenant_id: tenantId,
    _payload: normalizeDocumentVersionPayload(payload),
  } as never);
  if (error) {
    throw new Error(error.message);
  }
  return classifyProjectionResult((data ?? { ok: false, error: "EMPTY_RESPONSE" }) as GraphProjectionResult);
}

export async function projectWorkProductUpserted(
  admin: SupabaseClient,
  tenantId: string | null,
  payload: Record<string, unknown> | null,
): Promise<GraphProjectionResult> {
  const { data, error } = await admin.rpc("project_work_product_upserted" as never, {
    _tenant_id: tenantId,
    _payload: payload ?? {},
  } as never);
  if (error) {
    throw new Error(error.message);
  }
  return classifyProjectionResult((data ?? { ok: false, error: "EMPTY_RESPONSE" }) as GraphProjectionResult);
}

export async function backfillWorkProductGraph(
  admin: SupabaseClient,
  tenantId: string,
  limit = 200,
): Promise<{ ok: boolean; documentsProjected?: number; workProductsProjected?: number }> {
  const { data, error } = await admin.rpc("go3_work_graph_backfill" as never, {
    _tenant_id: tenantId,
    _limit: limit,
  } as never);
  if (error) throw new Error(error.message);
  return (data ?? { ok: false }) as {
    ok: boolean;
    documentsProjected?: number;
    workProductsProjected?: number;
  };
}
