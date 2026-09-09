// Chia sẻ bản đồ công việc bằng liên kết công khai — chỉ đọc, chỉ dữ liệu tối thiểu.
export const WORK_GRAPH_SHARE_NODE_LIMIT = 400;
export const WORK_GRAPH_SHARE_EDGE_LIMIT = 800;

/** Băm SHA-256 của mã liên kết; chỉ lưu bản băm trong cơ sở dữ liệu. */
export async function hashShareToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Sinh mã liên kết ngẫu nhiên, an toàn cho URL. */
export function generateShareToken(): string {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return [...raw].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 48);
}

export type PublicGraphNode = {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
};

export type PublicGraphPayload = {
  label: string;
  tenantName: string | null;
  expiresAt: string;
  nodes: PublicGraphNode[];
  edges: Array<{ source: string; target: string; type: string }>;
};

const TITLE_TABLES: Record<string, { table: string; column: string }> = {
  TASK: { table: "tasks", column: "title" },
  MEETING: { table: "meetings", column: "title" },
  MEETING_ARTIFACT: { table: "meeting_artifacts", column: "title" },
  DOCUMENT: { table: "documents", column: "title" },
  WORK_PRODUCT: { table: "work_products", column: "title" },
  WORKSPACE: { table: "workspaces", column: "name" },
};

/**
 * Đọc bản đồ công việc của một tổ chức cho người xem công khai.
 * Chỉ trả tiêu đề và quan hệ; không trả nội dung, tệp, email hay thông tin cá nhân.
 */
export async function buildPublicWorkGraph(
  admin: any,
  args: { tenantId: string; includeTasks: boolean; includeDocuments: boolean },
): Promise<{ nodes: PublicGraphNode[]; edges: PublicGraphPayload["edges"] }> {
  const allowed = new Set<string>(["WORKSPACE", "MEETING", "MEETING_ARTIFACT", "WORK_PRODUCT"]);
  if (args.includeTasks) allowed.add("TASK");
  if (args.includeDocuments) allowed.add("DOCUMENT");

  const { data: nodeRows } = await admin
    .from("work_nodes")
    .select("id, entity_type, entity_id")
    .eq("tenant_id", args.tenantId)
    .in("entity_type", [...allowed])
    .order("created_at", { ascending: false })
    .limit(WORK_GRAPH_SHARE_NODE_LIMIT);

  const rows = (nodeRows ?? []) as Array<{
    id: string;
    entity_type: string;
    entity_id: string;
  }>;

  // Nạp tiêu đề theo từng loại thực thể, gom theo lô.
  const titles = new Map<string, string>();
  await Promise.all(
    [...allowed].map(async (type) => {
      const cfg = TITLE_TABLES[type];
      if (!cfg) return;
      const ids = rows.filter((r) => r.entity_type === type).map((r) => r.entity_id);
      if (!ids.length) return;
      const { data } = await admin
        .from(cfg.table)
        .select(`id, ${cfg.column}`)
        .eq("tenant_id", args.tenantId)
        .in("id", ids.slice(0, WORK_GRAPH_SHARE_NODE_LIMIT));
      for (const r of (data ?? []) as any[]) {
        titles.set(`${type}:${r.id}`, (r[cfg.column] as string) || "(Không tiêu đề)");
      }
    }),
  );

  const visible = rows.filter((r) => titles.has(`${r.entity_type}:${r.entity_id}`));
  const nodes: PublicGraphNode[] = visible.map((r) => ({
    id: r.id,
    type: r.entity_type,
    title: titles.get(`${r.entity_type}:${r.entity_id}`) as string,
    subtitle: null,
  }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const { data: edgeRows } = await admin
    .from("work_edges")
    .select("source_node_id, target_node_id, relationship_type")
    .eq("tenant_id", args.tenantId)
    .limit(WORK_GRAPH_SHARE_EDGE_LIMIT);

  const edges = ((edgeRows ?? []) as any[])
    .filter((e) => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id))
    .map((e) => ({
      source: e.source_node_id as string,
      target: e.target_node_id as string,
      type: e.relationship_type as string,
    }));

  return { nodes, edges };
}
