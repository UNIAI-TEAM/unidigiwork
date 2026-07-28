import { z } from "zod";
import type { TaskId, TenantId, WorkspaceId, UserId } from "../common/ids";
import type { CommandMetadata } from "../common/base";
import { commandMetadataSchema } from "../common/base";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";

export interface TaskDto {
  id: TaskId;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  title: string;
  description?: string | null;
  status: TaskStatus;
  assigneeId?: UserId | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskCommand extends CommandMetadata {
  workspaceId: WorkspaceId;
  title: string;
  description?: string;
  assigneeId?: UserId;
}
export interface AssignTaskCommand extends CommandMetadata {
  assigneeId: UserId;
}
export type CompleteTaskCommand = CommandMetadata;

export const CreateTaskCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  assigneeId: z.string().uuid().optional(),
});

export const AssignTaskCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  assigneeId: z.string().uuid(),
});
