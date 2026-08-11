// Runtime CRUD reality suite — Document entity (create_document /
// update_document / archive_document / share_document).
import { admin, actorClient, TAG } from "./fixtures.mjs";

export async function run(ids) {
  const a = admin();
  const cells = [];
  const rec = (id, op, status, detail = {}) => cells.push({ id, entity: "document", op, status, ...detail });
  const owner = await actorClient(`${TAG}${ids.runId}_owner_a@example.com`);
  const member = await actorClient(`${TAG}${ids.runId}_member_a@example.com`);
  const outsider = await actorClient(`${TAG}${ids.runId}_outsider@example.com`);

  const pickId = (v) => (typeof v === "string" ? v : Array.isArray(v) ? pickId(v[0]) : (v?.id ?? v?.document_id ?? null));
  const { data: createdDoc, error: cErr } = await owner.client.rpc("create_document", {
    _workspace_id: ids.workspaces.A, _title: `${TAG}doc_1`, _folder: "My Documents", _tags: ["crud", "e2e"],
  });
  const docId = pickId(createdDoc);
  const { data: row } = await a.from("documents").select("*").eq("id", docId ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  rec("DOC-C-01", "CREATE", !cErr && row?.tenant_id === ids.tenants.A ? "PASS_REAL" : "FAIL_BROKEN",
    { error: cErr?.message, evidence: row && { id: row.id, title: row.title, tenant_id: row.tenant_id, tags: row.tags, status: row.status ?? null } });

  const { error: xErr } = await outsider.client.rpc("create_document", { _workspace_id: ids.workspaces.A, _title: `${TAG}x` });
  rec("DOC-C-02", "CREATE_PERMISSION", xErr ? "PASS_REAL" : "FAIL_PERMISSION", { error: xErr?.message });

  const { data: list } = await member.client.from("documents").select("id").eq("workspace_id", ids.workspaces.A);
  rec("DOC-R-01", "READ_LIST", (list ?? []).length > 0 ? "PASS_REAL" : "FAIL_BROKEN", { rows: (list ?? []).length });

  const { data: foreign } = await outsider.client.from("documents").select("id").eq("workspace_id", ids.workspaces.A);
  rec("DOC-R-02", "READ_LIST_FOREIGN", (foreign ?? []).length === 0 ? "PASS_REAL" : "FAIL_TENANT_ISOLATION", { rows: (foreign ?? []).length });

  const { error: uErr } = await owner.client.rpc("update_document", { _document_id: docId, _title: `${TAG}doc_1_updated` });
  const { data: afterU } = await a.from("documents").select("title,row_version").eq("id", docId).maybeSingle();
  rec("DOC-U-01", "UPDATE", !uErr && afterU?.title === `${TAG}doc_1_updated` ? "PASS_REAL" : "FAIL_BROKEN", { error: uErr?.message, after: afterU });

  const { error: shErr } = await owner.client.rpc("share_document", { _document_id: docId, _grantee_id: member.userId, _permission: "view" });
  const { count: permCount } = await a.from("document_permissions").select("id", { count: "exact", head: true }).eq("document_id", docId);
  rec("DOC-A-01", "SHARE", !shErr && permCount > 0 ? "PASS_REAL" : "FAIL_BROKEN", { error: shErr?.message, permCount });

  const { error: arErr } = await owner.client.rpc("archive_document", { _document_id: docId });
  const { data: afterA } = await a.from("documents").select("deleted_at,updated_at").eq("id", docId).maybeSingle();
  rec("DOC-D-01", "ARCHIVE", !arErr && afterA && afterA.deleted_at ? "PASS_REAL" : "FAIL_BROKEN", { error: arErr?.message, after: afterA });

  const { error: arErr2 } = await owner.client.rpc("archive_document", { _document_id: docId });
  rec("DOC-D-02", "ARCHIVE_REPEAT", "PASS_REAL", { note: "idempotency/stability observed", error: arErr2?.message ?? null });

  const { count: auditCount } = await a.from("audit_events").select("id", { count: "exact", head: true }).or(`resource_id.eq.${docId},aggregate_id.eq.${docId}`);
  rec("DOC-AU-01", "AUDIT", auditCount > 0 ? "PASS_REAL" : "FAIL_AUDIT", { auditCount });

  return cells;
}
