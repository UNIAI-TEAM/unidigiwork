// Runtime CRUD reality suite — Task entity (create_task / update_task /
// transition_task / assign_task RPC commands) executed with real actor JWTs
// and verified with service role reads.
import { admin, actorClient, TAG } from "./fixtures.mjs";

export async function run(ids) {
  const a = admin();
  const cells = [];
  const rec = (id, op, status, detail = {}) => cells.push({ id, entity: "task", op, status, ...detail });
  const owner = await actorClient(`${TAG}${ids.runId}_owner_a@example.com`);
  const member = await actorClient(`${TAG}${ids.runId}_member_a@example.com`);
  const outsider = await actorClient(`${TAG}${ids.runId}_outsider@example.com`);

  // C — create valid
  const before = (await a.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ids.workspaces.A)).count ?? 0;
  const { data: created, error: cErr } = await owner.client.rpc("create_task", {
    _workspace_id: ids.workspaces.A, _title: `${TAG}task_1`, _description: "d", _priority: "high",
  });
  const pickId = (v) => (typeof v === "string" ? v : Array.isArray(v) ? pickId(v[0]) : (v?.id ?? v?.task_id ?? null));
  const taskId = pickId(created);
  const after = (await a.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ids.workspaces.A)).count ?? 0;
  const { data: row } = await a.from("tasks").select("*").eq("id", taskId ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  rec("TASK-C-01", "CREATE", !cErr && after === before + 1 && row?.tenant_id === ids.tenants.A && row?.created_by ? "PASS_REAL" : "FAIL_BROKEN",
    { error: cErr?.message, before, after, evidence: row && { id: row.id, tenant_id: row.tenant_id, title: row.title, priority: row.priority, row_version: row.row_version } });
  if (row) ids.records.push({ table: "tasks", id: row.id });

  // C — invalid required field
  const { error: e2 } = await owner.client.rpc("create_task", { _workspace_id: ids.workspaces.A, _title: "" });
  rec("TASK-C-02", "CREATE_INVALID", e2 ? "PASS_REAL" : "FAIL_VALIDATION", { error: e2?.message });

  // C — cross-tenant attempt (owner A creating in workspace B)
  const { error: e3 } = await owner.client.rpc("create_task", { _workspace_id: ids.workspaces.B, _title: `${TAG}xtenant` });
  rec("TASK-C-03", "CREATE_CROSS_TENANT", e3 ? "PASS_REAL" : "FAIL_TENANT_ISOLATION", { error: e3?.message });

  // C — outsider denied
  const { error: e4 } = await outsider.client.rpc("create_task", { _workspace_id: ids.workspaces.A, _title: `${TAG}outsider` });
  rec("TASK-C-04", "CREATE_PERMISSION", e4 ? "PASS_REAL" : "FAIL_PERMISSION", { error: e4?.message });

  // C — double submit with same idempotency key
  const key = `${TAG}${ids.runId}-idem`;
  const r1 = await owner.client.rpc("create_task", { _workspace_id: ids.workspaces.A, _title: `${TAG}idem`, _idempotency_key: key });
  const r2 = await owner.client.rpc("create_task", { _workspace_id: ids.workspaces.A, _title: `${TAG}idem`, _idempotency_key: key });
  const { count: idemCount } = await a.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ids.workspaces.A).eq("title", `${TAG}idem`);
  rec("TASK-C-05", "CREATE_IDEMPOTENCY", idemCount === 1 ? "PASS_REAL" : "FAIL_BROKEN", { idemCount, r1: pickId(r1.data), r2: pickId(r2.data), error: r2.error?.message });

  // R — list as member (tenant scoped)
  const { data: listMember } = await member.client.from("tasks").select("id,title").eq("workspace_id", ids.workspaces.A);
  rec("TASK-R-01", "READ_LIST", (listMember ?? []).length > 0 ? "PASS_REAL" : "FAIL_BROKEN", { rows: (listMember ?? []).length });

  // R — foreign tenant denied
  const { data: listOutsider } = await outsider.client.from("tasks").select("id").eq("workspace_id", ids.workspaces.A);
  rec("TASK-R-02", "READ_LIST_FOREIGN", (listOutsider ?? []).length === 0 ? "PASS_REAL" : "FAIL_TENANT_ISOLATION", { rows: (listOutsider ?? []).length });

  // R — detail
  const { data: detail } = await member.client.from("tasks").select("*").eq("id", taskId).maybeSingle();
  rec("TASK-R-03", "READ_DETAIL", detail?.id === taskId ? "PASS_REAL" : "FAIL_BROKEN");

  // U — valid update + row_version bump
  const beforeU = row;
  const { error: uErr } = await owner.client.rpc("update_task", { _task_id: taskId, _title: `${TAG}task_1_updated`, _expected_row_version: beforeU?.row_version });
  const { data: afterU } = await a.from("tasks").select("*").eq("id", taskId).maybeSingle();
  rec("TASK-U-01", "UPDATE", !uErr && afterU?.title === `${TAG}task_1_updated` && afterU.row_version > beforeU.row_version ? "PASS_REAL" : "FAIL_BROKEN",
    { error: uErr?.message, before: { title: beforeU?.title, row_version: beforeU?.row_version }, after: { title: afterU?.title, row_version: afterU?.row_version } });

  // U — stale row_version rejected
  const { error: staleErr } = await owner.client.rpc("update_task", { _task_id: taskId, _title: "stale", _expected_row_version: beforeU?.row_version });
  const { data: afterStale } = await a.from("tasks").select("title").eq("id", taskId).maybeSingle();
  rec("TASK-U-02", "UPDATE_STALE_VERSION", staleErr && afterStale?.title !== "stale" ? "PASS_REAL" : "FAIL_CONCURRENCY", { error: staleErr?.message });

  // U — outsider unauthorized
  const { error: uPerm } = await outsider.client.rpc("update_task", { _task_id: taskId, _title: "hacked" });
  const { data: afterPerm } = await a.from("tasks").select("title").eq("id", taskId).maybeSingle();
  rec("TASK-U-03", "UPDATE_PERMISSION", uPerm && afterPerm?.title !== "hacked" ? "PASS_REAL" : "FAIL_PERMISSION", { error: uPerm?.message });

  // U — direct table update bypass attempt (architecture invariant)
  const { error: directErr } = await member.client.from("tasks").update({ title: "direct" }).eq("id", taskId);
  const { data: afterDirect } = await a.from("tasks").select("title").eq("id", taskId).maybeSingle();
  rec("TASK-U-04", "UPDATE_DIRECT_TABLE", afterDirect?.title !== "direct" ? "PASS_REAL" : "FAIL_BROKEN", { error: directErr?.message, note: "lifecycle write must go through command" });

  // Lifecycle — transition
  await owner.client.rpc("transition_task", { _task_id: taskId, _to_status: "in_progress" });
  const { error: tErr } = await owner.client.rpc("transition_task", { _task_id: taskId, _to_status: "done" });
  const { data: afterT } = await a.from("tasks").select("status,completed_at").eq("id", taskId).maybeSingle();
  rec("TASK-L-01", "COMPLETE", !tErr && afterT?.status === "done" ? "PASS_REAL" : "FAIL_BROKEN", { error: tErr?.message, after: afterT });

  // ASSIGN
  const { error: aErr } = await owner.client.rpc("assign_task", { _task_id: taskId, _assignee_id: member.userId });
  const { count: assigneeCount } = await a.from("task_assignees").select("task_id", { count: "exact", head: true }).eq("task_id", taskId);
  rec("TASK-A-01", "ASSIGN", !aErr && assigneeCount > 0 ? "PASS_REAL" : "FAIL_BROKEN", { error: aErr?.message, assigneeCount });

  // AUDIT reality
  const { count: auditCount } = await a.from("audit_events").select("id", { count: "exact", head: true }).eq("tenant_id", ids.tenants.A).or(`resource_id.eq.${taskId},aggregate_id.eq.${taskId}`);
  rec("TASK-AU-01", "AUDIT", auditCount > 0 ? "PASS_REAL" : "FAIL_AUDIT", { auditCount });

  // OUTBOX reality
  const { count: outboxCount } = await a.from("outbox_events").select("id", { count: "exact", head: true }).eq("tenant_id", ids.tenants.A);
  rec("TASK-OB-01", "OUTBOX", outboxCount > 0 ? "PASS_REAL" : "FAIL_OUTBOX", { outboxCount });

  // D — soft delete / archive semantics
  const { error: dErr } = await member.client.from("tasks").delete().eq("id", taskId);
  const { data: afterD } = await a.from("tasks").select("id,deleted_at").eq("id", taskId).maybeSingle();
  rec("TASK-D-01", "DELETE_DIRECT_DENIED", afterD ? "PASS_REAL" : "FAIL_BROKEN", { error: dErr?.message, stillExists: !!afterD });

  return cells;
}
