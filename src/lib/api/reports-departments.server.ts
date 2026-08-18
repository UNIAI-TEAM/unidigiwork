// Đếm số liệu báo cáo thật theo phòng ban trong một kỳ (RLS applies).
import { getCookie } from "@tanstack/react-start/server";
import { mapPgError } from "./business.server";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";

export type DepartmentReportRow = {
  department: string;
  members: number;
  tasks: number;
  documents: number;
  meetings: number;
  total: number;
};

export type DepartmentReport = {
  from: string;
  to: string;
  totals: { tasks: number; documents: number; meetings: number; total: number };
  rows: DepartmentReportRow[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const UNASSIGNED = "Chưa phân phòng ban";

export async function loadDepartmentReport(
  supabase: Db,
  userId: string,
  input: { from: string; to: string; workspaceId?: string | undefined },
): Promise<DepartmentReport> {
  const empty: DepartmentReport = {
    from: input.from,
    to: input.to,
    totals: { tasks: 0, documents: 0, meetings: 0, total: 0 },
    rows: [],
  };

  const { data: memberRows, error: memberErr } = await supabase
    .from("tenant_members")
    .select("tenant_id, user_id, status")
    .eq("user_id", userId)
    .eq("status", "active");
  if (memberErr) mapPgError(memberErr);
  const tenants = (memberRows ?? []) as Array<{ tenant_id: string }>;
  if (tenants.length === 0) return empty;
  const hint = getCookie(ACTIVE_TENANT_COOKIE);
  const tenantId = (hint && tenants.find((r) => r.tenant_id === hint)?.tenant_id) || tenants[0].tenant_id;

  const [membersRes, profilesRes] = await Promise.all([
    supabase.from("tenant_members").select("user_id").eq("tenant_id", tenantId).neq("status", "removed"),
    supabase.from("tenant_member_profiles").select("user_id, department").eq("tenant_id", tenantId),
  ]);
  if (membersRes.error) mapPgError(membersRes.error);
  if (profilesRes.error) mapPgError(profilesRes.error);

  const deptOf = new Map<string, string>();
  for (const p of profilesRes.data ?? []) {
    const d = ((p.department as string | null) ?? "").trim();
    if (d) deptOf.set(p.user_id as string, d);
  }
  const memberCount = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    const d = deptOf.get(m.user_id as string) ?? UNASSIGNED;
    memberCount.set(d, (memberCount.get(d) ?? 0) + 1);
  }

  const scope = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
    input.workspaceId ? q.eq("workspace_id", input.workspaceId) : q;

  const range = <T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(q: T) =>
    q.gte("created_at", input.from).lt("created_at", input.to);

  const [tasksRes, docsRes, meetsRes] = await Promise.all([
    range(scope(supabase.from("tasks").select("created_by").is("deleted_at", null))),
    range(scope(supabase.from("documents").select("created_by").is("deleted_at", null))),
    range(scope(supabase.from("meetings").select("created_by").is("deleted_at", null))),
  ]);
  for (const r of [tasksRes, docsRes, meetsRes]) if (r.error) mapPgError(r.error);

  const acc = new Map<string, DepartmentReportRow>();
  const row = (dept: string) => {
    let r = acc.get(dept);
    if (!r) {
      r = { department: dept, members: memberCount.get(dept) ?? 0, tasks: 0, documents: 0, meetings: 0, total: 0 };
      acc.set(dept, r);
    }
    return r;
  };
  for (const d of memberCount.keys()) row(d);

  const bump = (rows: Array<{ created_by: string | null }> | null, key: "tasks" | "documents" | "meetings") => {
    for (const it of rows ?? []) {
      const dept = (it.created_by && deptOf.get(it.created_by)) || UNASSIGNED;
      const r = row(dept);
      r[key] += 1;
      r.total += 1;
    }
  };
  bump(tasksRes.data, "tasks");
  bump(docsRes.data, "documents");
  bump(meetsRes.data, "meetings");

  const rows = Array.from(acc.values()).sort((a, b) => b.total - a.total || a.department.localeCompare(b.department, "vi"));
  const totals = rows.reduce(
    (s, r) => ({
      tasks: s.tasks + r.tasks,
      documents: s.documents + r.documents,
      meetings: s.meetings + r.meetings,
      total: s.total + r.total,
    }),
    { tasks: 0, documents: 0, meetings: 0, total: 0 },
  );
  return { from: input.from, to: input.to, totals, rows };
}
