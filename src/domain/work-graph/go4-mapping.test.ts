import { describe, expect, it } from "vitest";
import {
  executionGraphProjector,
  executionWorkProductGraphEdge,
  GO4_EXECUTOR_TYPES,
  humanExecutionUsesAiPipeline,
  isExecutionGraphEvent,
  taskHasExecutionEdge,
} from "./go4-mapping";

describe("GO-4 execution mapping", () => {
  it("projects HAS_EXECUTION and EXECUTION PRODUCES WORK_PRODUCT", () => {
    expect(taskHasExecutionEdge()).toEqual({
      code: "HAS_EXECUTION",
      sourceType: "TASK",
      targetType: "EXECUTION",
    });
    expect(executionWorkProductGraphEdge()).toEqual({
      code: "PRODUCES",
      sourceType: "EXECUTION",
      targetType: "WORK_PRODUCT",
    });
  });

  it("does not treat Human rows as AI WEE pipeline work", () => {
    expect(humanExecutionUsesAiPipeline("HUMAN")).toBe(false);
    expect(GO4_EXECUTOR_TYPES).toEqual(["AI", "HUMAN"]);
  });

  it("routes existing AI start and new provenance events to the execution projector", () => {
    expect(isExecutionGraphEvent("execution.execution.created")).toBe(true);
    expect(isExecutionGraphEvent("execution.work_product.linked")).toBe(true);
    expect(isExecutionGraphEvent("task.ai.execution_started")).toBe(true);
    expect(isExecutionGraphEvent("work_product.work_product.upserted")).toBe(false);
    expect(executionGraphProjector("task.ai.execution_started")).toBe("created");
    expect(executionGraphProjector("execution.work_product.linked")).toBe("linked");
  });
});
