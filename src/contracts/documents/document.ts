import { z } from "zod";
import type { DocumentId, TenantId, WorkspaceId, UserId } from "../common/ids";
import type { CommandMetadata, StorageObjectRef } from "../common/base";

export interface DocumentDto {
  id: DocumentId;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  title: string;
  storageRef?: StorageObjectRef | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdBy: UserId;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentCommand extends CommandMetadata {
  workspaceId: WorkspaceId;
  title: string;
  storageRef?: StorageObjectRef;
  mimeType?: string;
  sizeBytes?: number;
}
export interface UpdateDocumentCommand extends CommandMetadata {
  title?: string;
}
export type DeleteDocumentCommand = CommandMetadata;

export const CreateDocumentCommandSchema = z.object({
  idempotencyKey: z.string().min(1),
  correlationId: z.string().optional(),
  expectedRowVersion: z.number().int().nonnegative().optional(),
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(500),
  storageRef: z
    .object({
      provider: z.string().min(1),
      bucket: z.string().min(1),
      objectKey: z.string().min(1),
    })
    .optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
