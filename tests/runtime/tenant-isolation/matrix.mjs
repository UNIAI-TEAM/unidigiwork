// Batch 1A — canonical actor × action × resource-tenant matrix.
// Executed by runner.mjs. Keep this file declarative; no runtime state here.

export const ACTORS = [
  "anonymous",
  "outsider",
  "member_a",
  "guest_a",
  "admin_a",
  "owner_a",
  "member_b",
  "admin_b",
  "owner_b",
  "platform_admin",
];

export const TENANT_TABLES = [
  "workspaces",
  "documents",
  "email_threads",
  "email_messages",
  "email_states",
  "notifications",
];

/**
 * Cross-tenant read: any actor in tenant A must NOT see rows of tenant B.
 * Cross-tenant write: any actor in tenant A must NOT insert/update rows in
 * tenant B, including via tenant_id override in the request body.
 */
export function buildMatrix(ctx) {
  const { tenantA, tenantB } = ctx;
  const cells = [];

  // 1) Anonymous — deny everything on tenant tables
  for (const table of TENANT_TABLES) {
    cells.push({ actor: "anonymous", action: "select", table, tenant: "A", expected: "deny" });
    cells.push({ actor: "anonymous", action: "select", table, tenant: "B", expected: "deny" });
    cells.push({ actor: "anonymous", action: "insert", table, tenant: "A", expected: "deny" });
  }

  // 2) Outsider (no membership)
  for (const table of TENANT_TABLES) {
    cells.push({ actor: "outsider", action: "select", table, tenant: "A", expected: "deny" });
    cells.push({ actor: "outsider", action: "select", table, tenant: "B", expected: "deny" });
  }

  // 3) Members / guests / admins / owners of A: read own, deny B
  for (const actor of ["member_a", "guest_a", "admin_a", "owner_a"]) {
    for (const table of TENANT_TABLES) {
      cells.push({ actor, action: "select", table, tenant: "A", expected: "allow" });
      cells.push({ actor, action: "select", table, tenant: "B", expected: "deny" });
      cells.push({ actor, action: "update", table, tenant: "B", expected: "deny" });
      cells.push({ actor, action: "delete", table, tenant: "B", expected: "deny" });
    }
  }

  // 4) Members of B mirrored
  for (const actor of ["member_b", "admin_b", "owner_b"]) {
    for (const table of TENANT_TABLES) {
      cells.push({ actor, action: "select", table, tenant: "B", expected: "allow" });
      cells.push({ actor, action: "select", table, tenant: "A", expected: "deny" });
    }
  }

  // 5) Platform admin — must NOT implicitly bypass tenant RLS on ordinary reads
  //    (privileged access only via SECURITY DEFINER RPC audit-trailed).
  for (const table of TENANT_TABLES) {
    cells.push({ actor: "platform_admin", action: "select", table, tenant: "A", expected: "deny", notes: "platform admin must not implicit-bypass tenant RLS" });
  }

  // 6) Composite foreign-key: document with workspace of the wrong tenant
  cells.push({
    actor: "owner_a",
    action: "insert",
    table: "documents",
    tenant: "A",
    body: { workspace_id: tenantB.workspaceId, title: "e2e_1a_cross_fk" },
    expected: "deny",
    notes: "insert into tenant A with workspace of tenant B must fail FK/RLS",
  });

  // 7) Tenant context leakage — supplying tenant_id in body must not override trusted resolver
  cells.push({
    actor: "member_a",
    action: "insert",
    table: "documents",
    tenant: "A",
    body: { workspace_id: tenantA.workspaceId, tenant_id: tenantB.id, title: "e2e_1a_body_override" },
    expected: "allow_but_persisted_tenant_id_is_A",
  });

  // 8) Audit / outbox: browser roles cannot write
  for (const actor of ["outsider", "member_a", "owner_a", "platform_admin"]) {
    cells.push({ actor, action: "insert", table: "audit_events", tenant: "N/A", expected: "deny" });
    cells.push({ actor, action: "update", table: "audit_events", tenant: "N/A", expected: "deny" });
    cells.push({ actor, action: "delete", table: "audit_events", tenant: "N/A", expected: "deny" });
    cells.push({ actor, action: "insert", table: "outbox_events", tenant: "N/A", expected: "deny" });
  }

  // 9) Outbox lifecycle via SECURITY DEFINER RPCs — concurrent claim, lease
  cells.push({ actor: "server", action: "rpc", table: "claim_outbox_events", expected: "single-winner" });
  cells.push({ actor: "server", action: "rpc", table: "extend_outbox_lease", expected: "owner-only" });
  cells.push({ actor: "server", action: "rpc", table: "fail_outbox_event", expected: "retry-then-dead-letter" });

  return cells;
}