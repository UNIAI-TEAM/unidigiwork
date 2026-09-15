/**
 * GO-4 — Execution → Work Product provenance mapping.
 * Graph is derived. Source SSOT is ai_task_executions + execution_work_products.
 */
export const GO4_OUTBOX_EVENTS = {
  executionCreated: "execution.execution.created",
  executionWorkProductLinked: "execution.work_product.linked",
  /** Existing WEE event; also projects HAS_EXECUTION. */
  aiExecutionStarted: "task.ai.execution_started",
} as const;

export function isExecutionGraphEvent(eventType: string): boolean {
  return (
    eventType === GO4_OUTBOX_EVENTS.executionCreated ||
    eventType === GO4_OUTBOX_EVENTS.executionWorkProductLinked ||
    eventType === GO4_OUTBOX_EVENTS.aiExecutionStarted
  );
}

export function executionGraphProjector(eventType: string): "created" | "linked" | null {
  if (
    eventType === GO4_OUTBOX_EVENTS.executionCreated ||
    eventType === GO4_OUTBOX_EVENTS.aiExecutionStarted
  ) {
    return "created";
  }
  if (eventType === GO4_OUTBOX_EVENTS.executionWorkProductLinked) {
    return "linked";
  }
  return null;
}

/** Junction role is attribution on the source relation; graph edge is always PRODUCES. */
export function executionWorkProductGraphEdge(): {
  code: "PRODUCES";
  sourceType: "EXECUTION";
  targetType: "WORK_PRODUCT";
} {
  return { code: "PRODUCES", sourceType: "EXECUTION", targetType: "WORK_PRODUCT" };
}

export function taskHasExecutionEdge(): {
  code: "HAS_EXECUTION";
  sourceType: "TASK";
  targetType: "EXECUTION";
} {
  return { code: "HAS_EXECUTION", sourceType: "TASK", targetType: "EXECUTION" };
}

export const GO4_EXECUTOR_TYPES = ["AI", "HUMAN"] as const;
export type Go4ExecutorType = (typeof GO4_EXECUTOR_TYPES)[number];

export function humanExecutionUsesAiPipeline(_executorType: string): boolean {
  return false;
}
