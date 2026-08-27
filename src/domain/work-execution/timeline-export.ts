// WEE-1 — Chuẩn hoá timeline thực thi để xuất file đối chiếu (hard reload / regression).
// Thuần hàm, không I/O: dùng chung cho server function và script sinh artifact golden.
import type { WorkExecutionStepRow, WorkStepKind, WorkStepStatus } from "./contracts";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export const TIMELINE_EXPORT_SCHEMA = "uniwork.wee1.timeline.v1" as const;
export const GOLDEN_EXPORT_SCHEMA = "uniwork.wee1.timeline.golden.v1" as const;

export interface TimelineExecutionSummary {
  id: string;
  taskId: string;
  revision: number;
  status: string;
  templateCode: string | null;
  deliverableType: string | null;
  deliverableTitle: string | null;
  deliverableLength: number;
  errorCode: string | null;
  evidence: Record<string, JsonValue> | null;
  sourceRefs: JsonValue[];
  createdAt: string | null;
}

export interface TimelineStepEntry {
  seq: number;
  kind: WorkStepKind | string;
  status: WorkStepStatus | string;
  title: string | null;
  detail: string | null;
  errorCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  output: JsonValue;
}

export interface TimelineExportBundle {
  schema: typeof TIMELINE_EXPORT_SCHEMA;
  exportedAt: string;
  execution: TimelineExecutionSummary;
  steps: TimelineStepEntry[];
}

/** Bản golden: bỏ mọi trường biến thiên (id, timestamp, thời lượng) để so sánh regression. */
export interface TimelineGoldenBundle {
  schema: typeof GOLDEN_EXPORT_SCHEMA;
  execution: {
    revision: number;
    status: string;
    templateCode: string | null;
    deliverableType: string | null;
    hasDeliverable: boolean;
    errorCode: string | null;
    sourceCount: number;
    validationPassed: boolean | null;
    proposedActionCount: number | null;
  };
  steps: Array<{
    seq: number;
    kind: string;
    status: string;
    errorCode: string | null;
    outputKeys: string[];
  }>;
  fingerprint: string;
}

const asRecord = (v: unknown): Record<string, JsonValue> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, JsonValue>) : null;

function diffMs(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(ms) ? Math.max(0, ms) : null;
}

export function buildTimelineExport(input: {
  execution: Record<string, unknown>;
  steps: WorkExecutionStepRow[];
  exportedAt?: string;
}): TimelineExportBundle {
  const e = input.execution;
  const content = typeof e["deliverable_content"] === "string" ? (e["deliverable_content"] as string) : "";
  return {
    schema: TIMELINE_EXPORT_SCHEMA,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    execution: {
      id: String(e["id"] ?? ""),
      taskId: String(e["task_id"] ?? ""),
      revision: Number(e["revision"] ?? 0),
      status: String(e["status"] ?? ""),
      templateCode: (e["template_code"] as string | null) ?? null,
      deliverableType: (e["deliverable_type"] as string | null) ?? null,
      deliverableTitle: (e["deliverable_title"] as string | null) ?? null,
      deliverableLength: content.length,
      errorCode: (e["error_code"] as string | null) ?? null,
      evidence: asRecord(e["evidence"]),
      sourceRefs: Array.isArray(e["source_refs"]) ? (e["source_refs"] as JsonValue[]) : [],
      createdAt: (e["created_at"] as string | null) ?? null,
    },
    steps: [...input.steps]
      .sort((a, b) => a.seq - b.seq)
      .map((s) => ({
        seq: s.seq,
        kind: s.kind,
        status: s.status,
        title: s.title ?? null,
        detail: s.detail ?? null,
        errorCode: (s as { error_code?: string | null }).error_code ?? null,
        startedAt: s.started_at ?? null,
        completedAt: s.completed_at ?? null,
        durationMs: diffMs(s.started_at ?? null, s.completed_at ?? null),
        output: ((s as { output?: JsonValue }).output ?? null) as JsonValue,
      })),
  };
}

/** Hash ổn định (FNV-1a) để so sánh nhanh hai lần chạy. */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a_${h.toString(16).padStart(8, "0")}`;
}

export function buildTimelineGolden(bundle: TimelineExportBundle): TimelineGoldenBundle {
  const ev = bundle.execution.evidence ?? {};
  const steps = bundle.steps.map((s) => ({
    seq: s.seq,
    kind: String(s.kind),
    status: String(s.status),
    errorCode: s.errorCode,
    outputKeys: Object.keys(asRecord(s.output) ?? {}).sort(),
  }));
  const execution = {
    revision: bundle.execution.revision,
    status: bundle.execution.status,
    templateCode: bundle.execution.templateCode,
    deliverableType: bundle.execution.deliverableType,
    hasDeliverable: bundle.execution.deliverableLength > 0,
    errorCode: bundle.execution.errorCode,
    sourceCount: bundle.execution.sourceRefs.length,
    validationPassed: typeof ev["validationPassed"] === "boolean" ? (ev["validationPassed"] as boolean) : null,
    proposedActionCount:
      typeof ev["proposedActionCount"] === "number" ? (ev["proposedActionCount"] as number) : null,
  };
  return {
    schema: GOLDEN_EXPORT_SCHEMA,
    execution,
    steps,
    fingerprint: fingerprint({ execution, steps }),
  };
}
