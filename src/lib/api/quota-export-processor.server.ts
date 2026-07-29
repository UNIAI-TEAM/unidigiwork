import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export type ExportJob = {
  id: string;
  requested_by: string;
  tenant_id: string | null;
  meter_key: string | null;
  status_filter: "all" | "pass" | "fail";
  from_ts: string;
  to_ts: string;
  max_rows: number;
  format?: "csv" | "xlsx";
};

const HEADER = [
  "occurred_at",
  "tenant_id",
  "meter_key",
  "quota_limit",
  "current_usage",
  "requested_delta",
  "allowed",
  "reason",
  "actor_id",
  "correlation_id",
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Process a single export job: stream quota_check_events in pages,
 * build CSV, upload to `quota-exports` storage bucket, mark job succeeded.
 * Uses service-role client (RLS bypass). Caller must have already authorized.
 */
export async function processQuotaExportJob(admin: SupabaseClient, job: ExportJob) {
  // Claim the job (defensive: only run when still pending)
  const claim = await admin
    .from("quota_export_jobs")
    .update({ status: "running", started_at: new Date().toISOString(), error: null })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claim.data) return { skipped: true as const };

  try {
    const pageSize = 5000;
    const format = job.format ?? "csv";
    const lines: string[] = format === "csv" ? [HEADER.join(",")] : [];
    const rows: Record<string, unknown>[] = [];
    let fetched = 0;
    let truncated = false;

    while (fetched < job.max_rows) {
      const remaining = job.max_rows - fetched;
      const take = Math.min(pageSize, remaining);
      let q = admin
        .from("quota_check_events")
        .select(
          "occurred_at, tenant_id, meter_key, quota_limit, current_usage, requested_delta, allowed, reason, actor_id, correlation_id",
        )
        .gte("occurred_at", job.from_ts)
        .lte("occurred_at", job.to_ts)
        .order("occurred_at", { ascending: true })
        .range(fetched, fetched + take - 1);
      if (job.tenant_id) q = q.eq("tenant_id", job.tenant_id);
      if (job.meter_key) q = q.eq("meter_key", job.meter_key);
      if (job.status_filter === "pass") q = q.eq("allowed", true);
      if (job.status_filter === "fail") q = q.eq("allowed", false);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      for (const r of data) {
        if (format === "csv") {
          lines.push(HEADER.map((h) => csvEscape((r as Record<string, unknown>)[h])).join(","));
        } else {
          rows.push(r as Record<string, unknown>);
        }
      }
      fetched += data.length;
      if (data.length < take) break;
      if (fetched >= job.max_rows) {
        // Peek one extra to know if truncated
        const peek = await admin
          .from("quota_check_events")
          .select("id", { head: true, count: "exact" })
          .gte("occurred_at", job.from_ts)
          .lte("occurred_at", job.to_ts);
        if ((peek.count ?? 0) > job.max_rows) truncated = true;
        break;
      }
    }

    let body: Blob;
    let contentType: string;
    let path: string;
    let byteSize: number;
    if (format === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(rows, { header: HEADER });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "quota_check_events");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      body = new Blob([buf], { type: contentType });
      byteSize = buf.byteLength;
      path = `${job.requested_by}/${job.id}.xlsx`;
    } else {
      const csv = lines.join("\n");
      contentType = "text/csv;charset=utf-8";
      body = new Blob([csv], { type: contentType });
      byteSize = csv.length;
      path = `${job.requested_by}/${job.id}.csv`;
    }
    const upload = await admin.storage
      .from("quota-exports")
      .upload(path, body, { upsert: true, contentType });
    if (upload.error) throw new Error(upload.error.message);

    await admin
      .from("quota_export_jobs")
      .update({
        status: "succeeded",
        row_count: fetched,
        file_path: path,
        file_size_bytes: byteSize,
        truncated,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return { skipped: false as const, rowCount: fetched, truncated, path };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin
      .from("quota_export_jobs")
      .update({
        status: "failed",
        error: message.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    throw e;
  }
}

export async function claimAndProcessPending(admin: SupabaseClient, max = 3) {
  const { data: pending, error } = await admin
    .from("quota_export_jobs")
    .select("id, requested_by, tenant_id, meter_key, status_filter, from_ts, to_ts, max_rows, format")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(max);
  if (error) throw new Error(error.message);
  const processed: string[] = [];
  for (const j of pending ?? []) {
    await processQuotaExportJob(admin, j as ExportJob);
    processed.push(j.id);
  }
  return processed;
}