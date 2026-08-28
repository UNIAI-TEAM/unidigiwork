/**
 * EXECUTION PLAN CONTRACT (Gate 9 + Gate 8 — Investor Tech Hardening).
 *
 * Kế hoạch do model sinh ra là DỮ LIỆU KHÔNG ĐÁNG TIN CẬY. Nó phải đi qua một
 * schema nghiêm ngặt trước khi chạm vào pipeline. Model KHÔNG bao giờ được phép
 * sinh payload ghi dữ liệu tự do — nó chỉ mô tả `actionIntent` trong một enum
 * đóng, rồi lớp governance mới dịch intent thành đề xuất chờ người xác nhận.
 */
import { z } from "zod";
import type { WorkPlanItem } from "./contracts";

/** Enum đóng — trùng với AI_ACTION_TOOLS đang được governance hỗ trợ. */
export const ACTION_INTENT_TYPES = [
  "CREATE_TASK",
  "UPDATE_TASK_FIELDS",
  "CREATE_MEETING",
  "CREATE_EMAIL_DRAFT",
] as const;
export type ActionIntentType = (typeof ACTION_INTENT_TYPES)[number];

export const actionIntentSchema = z.object({
  actionType: z.enum(ACTION_INTENT_TYPES),
  objective: z.string().min(1).max(300),
  targetType: z.enum(["TASK", "MEETING", "EMAIL", "DOCUMENT"]).nullable().default(null),
  rationale: z.string().max(500).default(""),
});
export type ActionIntent = z.infer<typeof actionIntentSchema>;

export const planStepSchema = z.object({
  order: z.number().int().min(1).max(20),
  summary: z.string().min(1).max(300),
  needsAction: z.boolean().default(false),
  actionIntent: actionIntentSchema.nullable().default(null),
});

export const executionPlanSchema = z.object({
  objective: z.string().max(300).default(""),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  steps: z.array(planStepSchema).min(1).max(6),
});
export type ExecutionPlan = z.infer<typeof executionPlanSchema>;

export interface PlanParseResult {
  ok: boolean;
  plan: ExecutionPlan | null;
  items: WorkPlanItem[];
  errorCode: "PLAN_NOT_JSON" | "PLAN_SCHEMA_INVALID" | null;
}

/**
 * Phân tích văn bản model trả về thành kế hoạch hợp lệ.
 * Không dùng `JSON.parse` trần: mọi output dị dạng đều bị từ chối an toàn và
 * caller sẽ rơi về kế hoạch mặc định thay vì đưa dữ liệu rác vào pipeline.
 */
export function parseExecutionPlan(raw: string): PlanParseResult {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ok: false, plan: null, items: [], errorCode: "PLAN_NOT_JSON" };
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { ok: false, plan: null, items: [], errorCode: "PLAN_NOT_JSON" };
  }
  // Chuẩn hoá nhẹ: bù `order` thiếu theo vị trí, giữ nguyên phần còn lại để
  // schema thực sự kiểm tra chứ không "sửa cho qua".
  if (candidate && typeof candidate === "object" && Array.isArray((candidate as { steps?: unknown }).steps)) {
    const steps = (candidate as { steps: unknown[] }).steps;
    (candidate as { steps: unknown[] }).steps = steps.map((s, i) =>
      s && typeof s === "object" && (s as Record<string, unknown>)["order"] === undefined
        ? { ...(s as Record<string, unknown>), order: i + 1 }
        : s,
    );
  }
  const parsed = executionPlanSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, plan: null, items: [], errorCode: "PLAN_SCHEMA_INVALID" };
  }
  const items: WorkPlanItem[] = parsed.data.steps.map((s) => ({
    order: s.order,
    summary: s.summary,
    needsAction: s.needsAction || s.actionIntent !== null,
  }));
  return { ok: true, plan: parsed.data, items, errorCode: null };
}
