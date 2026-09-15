import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const mig = readFileSync(
  "supabase/migrations/20260915120000_go4_execution_work_product.sql",
  "utf8",
);
const wee = readFileSync("src/lib/api/work-execution.server.ts", "utf8");
const go3 = readFileSync("supabase/migrations/20260915090000_go3_option_b_work_graph.sql", "utf8");

describe("GO-4 authority boundaries", () => {
  it("does not create a second execution table or outcomes table", () => {
    expect(mig).not.toMatch(/CREATE TABLE public\.work_executions\b/);
    expect(mig).not.toMatch(/CREATE TABLE public\.outcomes\b/);
    expect(mig).toMatch(/CREATE TABLE IF NOT EXISTS public\.execution_work_products/);
    expect(mig).toMatch(/ALTER TABLE public\.ai_task_executions/);
  });

  it("does not rewrite GO-3 or Office save", () => {
    expect(go3).toMatch(/REALIZED_AS/);
    expect(mig).not.toMatch(/office_save_complete|document_versions/);
    expect(mig).toMatch(/PRODUCES', 'EXECUTION', 'WORK_PRODUCT'/);
    expect(mig).toMatch(/HAS_EXECUTION', 'TASK', 'EXECUTION'/);
  });

  it("keeps Human execution out of the AI WEE orchestrator", () => {
    expect(wee).not.toMatch(/start_human_task_execution/);
    expect(wee).toMatch(/record_execution_step_write_failure/);
    expect(wee).toMatch(/processStepWriteFailures/);
    expect(wee).toMatch(/NOT Sell Work evidence/);
  });

  it("does not treat work_units bind as Execution → Work Product", () => {
    expect(mig).toMatch(/work_units catalog binding is NOT Execution/);
    expect(mig).toMatch(/link_execution_work_product/);
  });
});
