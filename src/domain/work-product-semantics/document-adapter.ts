import type {
  DocumentArtifactDescriptor,
  WorkProductDescriptor,
  WorkProductVersionDescriptor,
} from "./types";
import { mergeMonotonicVersion } from "@/domain/work-graph/go3-mapping";

export { mergeMonotonicVersion };

export interface WorkProductRow {
  id: string;
  tenant_id?: string | null;
  workspace_id?: string | null;
  title?: string | null;
  business_type?: string | null;
  status?: string | null;
  current_version?: number | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WorkProductVersionRow {
  id: string;
  work_product_id: string;
  version: number;
  summary?: string | null;
  title?: string | null;
  ai_generated?: boolean | null;
  created_at?: string | null;
}

export interface DocumentRow {
  id: string;
  tenant_id: string;
  workspace_id: string;
  title: string;
  mime_type?: string | null;
  created_at: string;
  updated_at: string;
}

export function workProductFromRow(row: WorkProductRow): WorkProductDescriptor {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? null,
    workspaceId: row.workspace_id ?? null,
    title: row.title ?? "",
    businessType: row.business_type ?? null,
    status: row.status ?? null,
    currentVersion: row.current_version ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    sourceEntityType: "WORK_PRODUCT",
  };
}

export function workProductVersionFromRow(row: WorkProductVersionRow): WorkProductVersionDescriptor {
  return {
    id: row.id,
    workProductId: row.work_product_id,
    versionNumber: row.version,
    summary: row.summary ?? row.title ?? null,
    aiGenerated: !!row.ai_generated,
    createdAt: row.created_at ?? null,
  };
}

export function documentFromRow(row: DocumentRow): DocumentArtifactDescriptor {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    title: row.title,
    mimeType: row.mime_type ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceEntityType: "DOCUMENT",
  };
}
