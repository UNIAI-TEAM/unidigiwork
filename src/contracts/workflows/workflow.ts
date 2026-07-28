import { z } from "zod";
import type {
  TenantId,
  WorkspaceId,
  UserId,
  WorkflowId,
  WorkflowRunId,
  WorkflowStepId,
} from "../common/ids";
import type { CommandMetadata } from "../common/base";
import { commandMetadataSchema } from "../common/base";

// ADR-1D-001 §2.3
export type WorkflowStatus = "draft" | "published" | "archived";
export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";
export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export const WORKFLOW_STATUSES = ["draft", "published", "archived"] as const;
export const WORKFLOW_RUN_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;
export const WORKFLOW_STEP_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
] as const;

// Neutral DAG definition — no vendor engine bindings.
export interface WorkflowNodeDefinition {
  key: string;
  type: string;
  config?: Record<string, unknown>;
  next?: string[];
}
export interface WorkflowDefinition {
  version: 1;
  startNodeKey: string;
  nodes: WorkflowNodeDefinition[];
}

export const WorkflowNodeDefinitionSchema: z.ZodType<WorkflowNodeDefinition> = z.object({
  key: z.string().min(1).max(128).regex(/^[a-z0-9_.-]+$/i),
  type: z.string().min(1).max(128),
  config: z.record(z.unknown()).optional(),
  next: z.array(z.string().min(1)).max(50).optional(),
});

export const WorkflowDefinitionSchema = z
  .object({
    version: z.literal(1),
    startNodeKey: z.string().min(1),
    nodes: z.array(WorkflowNodeDefinitionSchema).min(1).max(200),
  })
  .refine(
    (def) => {
      const keys = new Set(def.nodes.map((n) => n.key));
      if (keys.size !== def.nodes.length) return false;
      if (!keys.has(def.startNodeKey)) return false;
      for (const n of def.nodes) {
        for (const nx of n.next ?? []) if (!keys.has(nx)) return false;
      }
      return true;
    },
    { message: "Invalid workflow DAG: duplicate keys or unresolved references" },
  );

export interface WorkflowDto {
  id: WorkflowId;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  name: string;
  description?: string | null;
  definition: WorkflowDefinition;
  version: number;
  status: WorkflowStatus;
  publishedAt?: string | null;
  createdBy?: UserId | null;
  updatedBy?: UserId | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunDto {
  id: WorkflowRunId;
  workflowId: WorkflowId;
  tenantId: TenantId;
  workflowVersion: number;
  status: WorkflowRunStatus;
  context: Record<string, unknown>;
  startedAt?: string | null;
  endedAt?: string | null;
  correlationId?: string | null;
  triggeredBy?: UserId | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepDto {
  id: WorkflowStepId;
  runId: WorkflowRunId;
  tenantId: TenantId;
  stepKey: string;
  status: WorkflowStepStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

// Commands
export interface CreateWorkflowCommand extends CommandMetadata {
  workspaceId: WorkspaceId;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
}
export interface UpdateWorkflowCommand extends CommandMetadata {
  name?: string;
  description?: string | null;
  definition?: WorkflowDefinition;
}
export type PublishWorkflowCommand = CommandMetadata;
export interface StartWorkflowRunCommand extends CommandMetadata {
  context?: Record<string, unknown>;
}
export interface AdvanceWorkflowStepCommand extends CommandMetadata {
  stepKey: string;
  toStatus: WorkflowStepStatus;
  output?: Record<string, unknown>;
  error?: string;
}
export type CancelWorkflowRunCommand = CommandMetadata & { reason?: string };

export const CreateWorkflowCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  definition: WorkflowDefinitionSchema,
});

export const UpdateWorkflowCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  definition: WorkflowDefinitionSchema.optional(),
});

export const StartWorkflowRunCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  context: z.record(z.unknown()).optional(),
});

export const AdvanceWorkflowStepCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  stepKey: z.string().min(1).max(128),
  toStatus: z.enum(WORKFLOW_STEP_STATUSES),
  output: z.record(z.unknown()).optional(),
  error: z.string().max(4000).optional(),
});

export const CancelWorkflowRunCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  reason: z.string().max(2000).optional(),
});