// Điều hành trường học — bản tin BGH/tổ chuyên môn dựa trên dữ liệu thật (grounded), lớp gói "school".
import { streamText } from "ai";
import { effectiveItem, listPackRows } from "./pack-admin.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const MODEL = "openai/gpt-6-astra";

export type DeptRow = {
  workspace_id: string;
  name: string;
  open_tasks: number;
  overdue: number;
  blocked: number;
  done_7d: number;
  meetings_7d: number;
  overdue_titles: string[];
};

const DEFAULT_RULES = `Bạn soạn "Bản tin điều hành buổi sáng" cho Ban Giám hiệu.
Quy tắc: chỉ dùng DỮ LIỆU THẬT bên dưới, không bịa số liệu/tên người/sự kiện; mỗi ý ghi nguồn (tên tổ).
Không nêu thông tin cá nhân học sinh. Nếu dữ liệu trống, nói rõ "chưa có dữ liệu".
Cấu trúc markdown: ## Điểm nóng cần xử lý · ## Tình hình các tổ · ## Lịch họp 7 ngày tới · ## Đề xuất chỉ đạo (tối đa 3).
Ngắn gọn, tối đa 250 từ.`;

export async function loadOverview(db: Db, tenantId: string): Promise<DeptRow[]> {
  const { data, error } = await db.rpc("school_overview", { _tenant_id: tenantId });
  if (error) throw new Error(error.message);
  return (data ?? []) as DeptRow[];
}

export function buildFacts(rows: DeptRow[]): string[] {
  const f: string[] = [];
  for (const r of rows) {
    f.push(
      `[${r.name}] việc đang mở ${r.open_tasks}, quá hạn ${r.overdue}, bị chặn ${r.blocked}, hoàn thành 7 ngày ${r.done_7d}, họp 7 ngày tới ${r.meetings_7d}`,
    );
    for (const t of r.overdue_titles ?? []) f.push(`[${r.name}] quá hạn: "${t}"`);
  }
  return f;
}

export async function generateBrief(
  db: Db,
  tenantId: string,
  workspaceId: string | null,
): Promise<{ status: "ok" | "no_data" | "error"; content: string; facts: string[] }> {
  const all = await loadOverview(db, tenantId);
  const rows = workspaceId ? all.filter((r) => r.workspace_id === workspaceId) : all;
  const facts = buildFacts(rows);
  const hasData = rows.some((r) => r.open_tasks + r.done_7d + r.meetings_7d > 0);
  if (!hasData) return { status: "no_data", content: "", facts };
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { status: "error", content: "", facts };

  let rules = DEFAULT_RULES;
  try {
    const packRows = await listPackRows(db, tenantId);
    const skill = effectiveItem(packRows, "skill", "executive_brief");
    const body = skill?.content?.["body"];
    if (typeof body === "string" && body.trim()) rules = body;
  } catch {
    /* dùng quy tắc mặc định */
  }

  try {
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
    const provider = createLovableResponsesProvider(apiKey);
    const result = streamText({
      model: provider.responses(MODEL),
      system: rules + (workspaceId ? "\nPhạm vi: chỉ một tổ chuyên môn." : "\nPhạm vi: toàn trường."),
      prompt: `DỮ LIỆU THẬT (${new Date().toLocaleDateString("vi-VN")}):\n${facts.join("\n")}`,
    });
    const content = (await result.text).trim();
    return { status: content ? "ok" : "error", content, facts };
  } catch {
    return { status: "error", content: "", facts };
  }
}

/** Chạy theo lịch: gọi mỗi 15 phút; tạo bản tin toàn trường đúng khung giờ (Asia/Ho_Chi_Minh). */
export async function runScheduledBriefs(admin: Db, now = new Date()) {
  const vn = new Date(now.getTime() + 7 * 3600_000);
  const day = vn.getUTCDay();
  const mins = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const dateKey = vn.toISOString().slice(0, 10);
  const { data: tenants } = await admin.from("tenants").select("id").eq("industry_pack", "school");
  let created = 0;
  for (const t of (tenants ?? []) as Array<{ id: string }>) {
    const rows = await listPackRows(admin, t.id);
    const sched = effectiveItem(rows, "brief_schedule", "daily", now.getTime());
    const c = (sched?.content ?? {}) as { enabled?: boolean; time?: string; weekdays?: number[]; roles?: string[] };
    if (!c.enabled || !c.weekdays?.includes(day)) continue;
    const [h, m] = String(c.time ?? "07:00").split(":").map(Number);
    const target = (h || 0) * 60 + (m || 0);
    if (mins < target || mins >= target + 15) continue;
    const b = await generateBrief(admin, t.id, null);
    const { data: id, error } = await admin.rpc("save_school_brief", {
      _tenant_id: t.id,
      _workspace_id: null,
      _content: b.content,
      _facts: b.facts,
      _trigger: "scheduled",
      _status: b.status,
      _idempotency_key: `sched:${dateKey}`,
    });
    if (error || !id) continue;
    if (b.status === "ok") await admin.rpc("notify_school_brief", { _brief_id: id, _roles: c.roles ?? ["tenant_owner", "tenant_admin"] });
    created += 1;
  }
  return { created };
}
