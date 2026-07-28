import { z } from "zod";
import type { DocumentId, TenantId, WorkspaceId, UserId } from "../common/ids";
import type { CommandMetadata, StorageObjectRef } from "../common/base";
import { commandMetadataSchema } from "../common/base";

// ADR-1D-001 §2.3
export type DocumentPermissionPrincipalType = "user" | "workspace" | "tenant";
export type DocumentPermissionLevel = "view" | "comment" | "edit" | "manage";

export const DOCUMENT_PRINCIPAL_TYPES = ["user", "workspace", "tenant"] as const;
export const DOCUMENT_PERMISSION_LEVELS = ["view", "comment", "edit", "manage"] as const;

const storageRefSchema = z.object({
  provider: z.string().min(1),
  bucket: z.string().min(1),
  objectKey: z.string().min(1),
});

export interface DocumentDto {
  id: DocumentId;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  title: string;
  folder: string;
  tags: string[];
  storageRef?: StorageObjectRef | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  currentVersion: number;
  createdBy?: UserId | null;
  updatedBy?: UserId | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersionDto {
  id: string;
  documentId: DocumentId;
  version: number;
  storageRef?: StorageObjectRef | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  comment?: string | null;
  authorId?: UserId | null;
  createdAt: string;
}

export interface DocumentPermissionDto {
  id: string;
  documentId: DocumentId;
  principalType: DocumentPermissionPrincipalType;
  principalId: string;
  level: DocumentPermissionLevel;
  grantedBy?: UserId | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentCommand extends CommandMetadata {
  workspaceId: WorkspaceId;
  title: string;
  folder?: string;
  tags?: string[];
  storageRef?: StorageObjectRef;
  mimeType?: string;
  sizeBytes?: number;
}
export interface UpdateDocumentCommand extends CommandMetadata {
  title?: string;
  folder?: string;
  tags?: string[];
}
export interface UploadDocumentVersionCommand extends CommandMetadata {
  storageRef: StorageObjectRef;
  mimeType?: string;
  sizeBytes?: number;
  comment?: string;
}
export interface ShareDocumentCommand extends CommandMetadata {
  principalType: DocumentPermissionPrincipalType;
  principalId: string;
  level: DocumentPermissionLevel;
}
export type ArchiveDocumentCommand = CommandMetadata;

export const CreateDocumentCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(500),
  folder: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(64)).max(50).optional(),
  storageRef: storageRefSchema.optional(),
  mimeType: z.string().max(255).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export const UpdateDocumentCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  title: z.string().min(1).max(500).optional(),
  folder: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(64)).max(50).optional(),
});

export const UploadDocumentVersionCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  storageRef: storageRefSchema,
  mimeType: z.string().max(255).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  comment: z.string().max(2000).optional(),
});

export const ShareDocumentCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  principalType: z.enum(DOCUMENT_PRINCIPAL_TYPES),
  principalId: z.string().uuid(),
  level: z.enum(DOCUMENT_PERMISSION_LEVELS),
});
