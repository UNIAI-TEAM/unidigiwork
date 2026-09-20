// Kết quả công việc (Work Products) — helper phía máy chủ.
// Không import từ file này ở phía client.
import { ApiError } from "@/contracts/errors";

type Sb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type ContextSource = {
  type: "WORKSPACE" | "MEETING" | "MEETING_ARTIFACT" | "TASK" | "DOCUMENT" | "KNOWLEDGE";
  id: string;
  title: string;
  snippet: string;
  /** Dấu phiên bản/thời điểm của nguồn để chứng minh nguồn gốc về sau. */
  stamp: string | null;
};

/** Tổ chức hiện hành: ưu tiên workspace, sau đó cookie, cuối cùng là tenant đầu tiên. */
export async function resolveTenantId(
  supabase: Sb,
  userId: string,
  workspaceId: string | null,
  cookieTenant: string | null,
): Promise<string> {
  if (workspaceId) {
    const { data } = await supabase.from("workspaces").select("tenant_id").eq("id", workspaceId).maybeSingle();
    if (data?.tenant_id) return data.tenant_id as string;
    throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORKSPACE_NOT_FOUND" });
  }
  if (cookieTenant) {
    const { data } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("tenant_id", cookieTenant)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (data?.tenant_id) return data.tenant_id as string;
  }
  const { data: first } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (first?.tenant_id) return first.tenant_id as string;
  throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "NO_ACTIVE_TENANT" });
}

/** Nguồn ngữ cảnh khả dụng cho một kết quả công việc (người dùng tự bật/tắt). */
export async function collectContextSources(
  supabase: Sb,
  product: { id: string; tenant_id: string; workspace_id: string | null },
): Promise<ContextSource[]> {
  const out: ContextSource[] = [];
  const ws = product.workspace_id;

  const [wsRow, tasks, meetings, artifacts, docs, knowledge] = await Promise.all([
    ws ? supabase.from("workspaces").select("id, name, description, updated_at").eq("id", ws).maybeSingle() : Promise.resolve({ data: null }),
    ws
      ? supabase.from("tasks").select("id, title, description, status, updated_at").eq("workspace_id", ws).is("deleted_at", null).order("updated_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: [] }),
    ws
      ? supabase.from("meetings").select("id, title, agenda, start_at, updated_at").eq("workspace_id", ws).is("deleted_at", null).order("start_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),
    supabase
      .from("meeting_artifacts")
      .select("id, title, kind, detail, updated_at, workspace_id")
      .eq("tenant_id", product.tenant_id)
      .order("updated_at", { ascending: false })
      .limit(6),
    ws
      ? supabase.from("documents").select("id, title, content, updated_at").eq("workspace_id", ws).is("deleted_at", null).order("updated_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),
    supabase
      .from("knowledge_articles")
      .select("id, title, summary, updated_at")
      .eq("tenant_id", product.tenant_id)
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  const clip = (v: unknown, n = 400) => String(v ?? "").replace(/\s+/g, " ").slice(0, n);

  if (wsRow?.data) {
    out.push({
      type: "WORKSPACE",
      id: wsRow.data.id,
      title: wsRow.data.name,
      snippet: clip(wsRow.data.description),
      stamp: wsRow.data.updated_at ?? null,
    });
  }
  for (const t of tasks.data ?? []) {
    out.push({ type: "TASK", id: t.id, title: t.title, snippet: `${t.status} — ${clip(t.description)}`, stamp: t.updated_at ?? null });
  }
  for (const m of meetings.data ?? []) {
    out.push({ type: "MEETING", id: m.id, title: m.title, snippet: clip(m.agenda), stamp: m.updated_at ?? m.start_at ?? null });
  }
  for (const a of artifacts.data ?? []) {
    out.push({ type: "MEETING_ARTIFACT", id: a.id, title: a.title ?? a.kind, snippet: clip(a.detail), stamp: a.updated_at ?? null });
  }
  for (const d of docs.data ?? []) {
    out.push({ type: "DOCUMENT", id: d.id, title: d.title, snippet: clip(d.content), stamp: d.updated_at ?? null });
  }
  for (const k of knowledge.data ?? []) {
    out.push({ type: "KNOWLEDGE", id: k.id, title: k.title, snippet: clip(k.summary), stamp: k.updated_at ?? null });
  }
  return out;
}

/** Mẫu nội dung khởi tạo theo loại nghiệp vụ. */
export function templateFor(businessType: string, title: string): string {
  const heading = `# ${title}\n\n`;
  switch (businessType) {
    case "PROPOSAL":
      return `${heading}## Bối cảnh\n\n## Vấn đề cần giải quyết\n\n## Giải pháp đề xuất\n\n## Phạm vi & tiến độ\n\n## Chi phí\n\n## Bước tiếp theo\n`;
    case "REPORT":
      return `${heading}## Tóm tắt điều hành\n\n## Kết quả chính\n\n## Số liệu\n\n## Rủi ro\n\n## Khuyến nghị\n`;
    case "ANALYSIS":
      return `${heading}## Câu hỏi phân tích\n\n## Dữ liệu sử dụng\n\n## Phát hiện\n\n## Kết luận\n`;
    case "CONTRACT":
      return `${heading}## Các bên\n\n## Phạm vi công việc\n\n## Giá trị & thanh toán\n\n## Thời hạn\n\n## Điều khoản khác\n`;
    case "PLAN":
      return `${heading}## Mục tiêu\n\n## Các mốc\n\n## Phân công\n\n## Rủi ro & phương án\n`;
    case "PRESENTATION":
      return `${heading}## Slide 1 — Vấn đề\n\n## Slide 2 — Giải pháp\n\n## Slide 3 — Bằng chứng\n\n## Slide 4 — Đề xuất\n`;
    case "MEMO":
      return `${heading}## Nội dung\n\n## Quyết định cần có\n`;
    default:
      return heading;
  }
}
