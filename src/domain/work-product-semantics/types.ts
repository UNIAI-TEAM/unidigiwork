/** GO-3 Option B deliverable semantics. Distinct from WEE work_units and from documents. */

export const WORK_PRODUCT_BUSINESS_TYPES = [
  "PROPOSAL",
  "REPORT",
  "ANALYSIS",
  "CONTRACT",
  "PLAN",
  "PRESENTATION",
  "MEMO",
  "DOCUMENT",
  "OTHER",
] as const;

export type WorkProductBusinessType = (typeof WORK_PRODUCT_BUSINESS_TYPES)[number];

export interface WorkProductDescriptor {
  id: string;
  tenantId: string | null;
  workspaceId: string | null;
  title: string;
  businessType: string | null;
  status: string | null;
  currentVersion: number | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  sourceEntityType: "WORK_PRODUCT";
}

export interface WorkProductVersionDescriptor {
  id: string;
  workProductId: string;
  versionNumber: number;
  summary: string | null;
  aiGenerated: boolean;
  createdAt: string | null;
}

export interface DocumentArtifactDescriptor {
  id: string;
  tenantId: string;
  workspaceId: string;
  title: string;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
  sourceEntityType: "DOCUMENT";
}

export function isWorkProductBusinessType(value: string): boolean {
  return (WORK_PRODUCT_BUSINESS_TYPES as readonly string[]).includes(value);
}
