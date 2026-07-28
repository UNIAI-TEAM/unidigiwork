import { z } from "zod";
import type { TaskId, TenantId, WorkspaceId, UserId } from "../common/ids";
import type { CommandMetadata } from "../common/base";
import { commandMetadataSchema } from "../common/base";

// Blueprint §5 / ADR-1D-001 §2.3 — canonical DB values (see enum task_status).
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "canceled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskAssigneeRole = "owner" | "assignee" | "reviewer" | "watcher";

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "canceled"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const TASK_ASSIGNEE_ROLES = ["owner", "assignee", "reviewer", "watcher"] as const;

// ADR-1D-001 §2.3 — allowed status transitions enforced by transition_task RPC.
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["in_progress", "blocked", "canceled"],
  in_progress: ["blocked", "done", "canceled", "todo"],
  blocked: ["in_progress", "canceled", "todo"],
  done: ["in_progress"],
  canceled: ["todo"],
};

export function isTaskTransitionAllowed(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  return TASK_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TaskDto {
  id: TaskId;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  parentTaskId?: TaskId | null;
  projectId?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: string | null;
  completedAt?: string | null;
  rowVersion: number;
  createdBy?: UserId | null;
  updatedBy?: UserId | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAssigneeDto {
  taskId: TaskId;
  userId: UserId;
  role: TaskAssigneeRole;
  assignedBy?: UserId | null;
  assignedAt: string;
}

export interface TaskCommentDto {
  id: string;
  taskId: TaskId;
  authorId: UserId;
  body: string;
  editedAt?: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskCommand extends CommandMetadata {
  workspaceId: WorkspaceId;
  parentTaskId?: TaskId;
  projectId?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueAt?: string;
  assigneeIds?: UserId[];
}
export interface UpdateTaskCommand extends CommandMetadata {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueAt?: string | null;
}
export interface TransitionTaskCommand extends CommandMetadata {
  toStatus: TaskStatus;
}
export interface AssignTaskCommand extends CommandMetadata {
  userId: UserId;
  role?: TaskAssigneeRole;
}
export interface CommentTaskCommand extends CommandMetadata {
  body: string;
}
export type DeleteTaskCommand = CommandMetadata;

export const CreateTaskCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  workspaceId: z.string().uuid(),
  parentTaskId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueAt: z.string().datetime().optional(),
  assigneeIds: z.array(z.string().uuid()).max(50).optional(),
});

export const UpdateTaskCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export const TransitionTaskCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  toStatus: z.enum(TASK_STATUSES),
});

export const AssignTaskCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  userId: z.string().uuid(),
  role: z.enum(TASK_ASSIGNEE_ROLES).optional(),
});

export const CommentTaskCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  body: z.string().min(1).max(10000),
});
