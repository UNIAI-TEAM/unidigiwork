// Runtime CRUD reality suite — Workspace/tenant + membership + tags.
import { admin, actorClient, TAG } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";

export async function run(ids) {
  const a = admin();
  const cells = [];
  const rec = (id, entity, op, status, detail = {}) => cells.push({ id, entity, op, status, ...detail });
  const owner = await actorClient(`${TAG}${ids.runId}_owner_a@example.com`);
  const member = await actorClient(`${TAG}${ids.runId}_member_a@example.com`);
  const outsider = await actorClient(`${TAG}${ids.runId}_outsider@example.com`);

  // Workspace create through the app path (insert + provisioning trigger)
  const { data: provRows, error: cErr } = await owner.client.rpc("provision_tenant", {
    _name: `${TAG}${ids.runId}_t_new`,
    _slug: `${TAG}${ids.runId}-t-new`.toLowerCase().replace(/_/g, "-"),
    _owner_id: owner.userId,
    _default_workspace_name: `${TAG}${ids.runId}_ws_new`,
    _idempotency_key: `${TAG}${ids.runId}-new`,
  });
  const provRow = Array.isArray(provRows) ? provRows[0] : provRows;
  const wsId = provRow?.workspace_id ?? "00000000-0000-0000-0000-000000000000";
  const { data: wsRow } = await a.from("workspaces").select("id,name,tenant_id,owner_id").eq("id", wsId).maybeSingle();
  const { data: tenantRow } = await a.from("tenants").select("id,status").eq("id", wsRow?.tenant_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  const { count: memberCount } = await a.from("tenant_members").select("user_id", { count: "exact", head: true }).eq("tenant_id", wsRow?.tenant_id ?? "00000000-0000-0000-0000-000000000000");
  rec("WS-C-01", "workspace", "CREATE", !cErr && wsRow && tenantRow && memberCount > 0 ? "PASS_REAL" : "FAIL_BROKEN",
    { error: cErr?.message, evidence: { workspace: wsRow, tenant: tenantRow, memberCount } });
  if (wsRow) ids.tenants[`NEW_${ids.runId}`] = wsRow.tenant_id;

  // Atomicity: workspace without tenant/membership is an invariant violation
  rec("WS-T-01", "workspace", "TRANSACTION_ATOMICITY", wsRow && tenantRow && memberCount > 0 ? "PASS_REAL" : "FAIL_BROKEN",
    { note: "workspace → tenant → owner membership must be atomic" });

  // Update
  const { error: uErr } = await owner.client.from("workspaces").update({ name: `${TAG}${ids.runId}_ws_new_upd` }).eq("id", wsId);
  const { data: afterU } = await a.from("workspaces").select("name").eq("id", wsId).maybeSingle();
  rec("WS-U-01", "workspace", "UPDATE", !uErr && afterU?.name?.endsWith("_upd") ? "PASS_REAL" : "FAIL_BROKEN", { error: uErr?.message, after: afterU });

  // Cross-tenant update denied
  const { error: xErr } = await outsider.client.from("workspaces").update({ name: "hacked" }).eq("id", wsId);
  const { data: afterX } = await a.from("workspaces").select("name").eq("id", wsId).maybeSingle();
  rec("WS-U-02", "workspace", "UPDATE_CROSS_TENANT", afterX?.name !== "hacked" ? "PASS_REAL" : "FAIL_TENANT_ISOLATION", { error: xErr?.message });

  // Foreign tenant read
  const { data: foreignRead } = await outsider.client.from("workspaces").select("id").eq("id", ids.workspaces.A);
  rec("WS-R-01", "workspace", "READ_FOREIGN", (foreignRead ?? []).length === 0 ? "PASS_REAL" : "FAIL_TENANT_ISOLATION", { rows: (foreignRead ?? []).length });

  // Workspace tags CRUD (direct table, RLS-governed by design)
  const { data: tag, error: tErr } = await owner.client.from("workspace_tags").insert({ workspace_id: ids.workspaces.A, name: `${TAG}tag`, color: "#3B82F6" }).select().maybeSingle();
  rec("TAG-C-01", "workspace_tag", "CREATE", !tErr && tag?.id ? "PASS_REAL" : "FAIL_BROKEN", { error: tErr?.message, evidence: tag && { id: tag.id, name: tag.name } });
  if (tag) {
    const { error: tuErr } = await owner.client.from("workspace_tags").update({ name: `${TAG}tag_upd` }).eq("id", tag.id);
    const { data: tAfter } = await a.from("workspace_tags").select("name").eq("id", tag.id).maybeSingle();
    rec("TAG-U-01", "workspace_tag", "UPDATE", !tuErr && tAfter?.name?.endsWith("_upd") ? "PASS_REAL" : "FAIL_BROKEN", { error: tuErr?.message, after: tAfter });

    const { error: xtErr } = await outsider.client.from("workspace_tags").update({ name: "hacked" }).eq("id", tag.id);
    const { data: tAfterX } = await a.from("workspace_tags").select("name").eq("id", tag.id).maybeSingle();
    rec("TAG-U-02", "workspace_tag", "UPDATE_CROSS_TENANT", tAfterX?.name !== "hacked" ? "PASS_REAL" : "FAIL_TENANT_ISOLATION", { error: xtErr?.message });

    await owner.client.from("workspace_tags").delete().eq("id", tag.id);
    const { data: tAfterD } = await a.from("workspace_tags").select("id").eq("id", tag.id).maybeSingle();
    rec("TAG-D-01", "workspace_tag", "DELETE", !tAfterD ? "PASS_REAL" : "FAIL_BROKEN");
  }

  // Membership: change role via command
  const { error: rErr } = await owner.client.rpc("change_tenant_member_role", { _tenant_id: ids.tenants.A, _user_id: member.userId, _new_role: "manager" });
  const { data: mAfter } = await a.from("tenant_members").select("role").eq("tenant_id", ids.tenants.A).eq("user_id", member.userId).maybeSingle();
  rec("MEM-U-01", "tenant_member", "CHANGE_ROLE", !rErr && mAfter?.role === "manager" ? "PASS_REAL" : "FAIL_BROKEN", { error: rErr?.message, after: mAfter });

  const { error: rPerm } = await outsider.client.rpc("change_tenant_member_role", { _tenant_id: ids.tenants.A, _user_id: member.userId, _new_role: "tenant_owner" });
  const { data: mAfter2 } = await a.from("tenant_members").select("role").eq("tenant_id", ids.tenants.A).eq("user_id", member.userId).maybeSingle();
  rec("MEM-U-02", "tenant_member", "CHANGE_ROLE_PERMISSION", rPerm && mAfter2?.role !== "tenant_owner" ? "PASS_REAL" : "FAIL_PERMISSION", { error: rPerm?.message });

  return cells;
}
