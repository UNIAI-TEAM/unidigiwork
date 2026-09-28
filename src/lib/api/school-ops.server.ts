// Điều hành trường học — bản tin BGH/tổ chuyên môn dựa trên dữ liệu thật (grounded), lớp gói "school".
import { streamText } from "ai";
import { effectiveItem, listPackRows, mergedVocabulary } from "./pack-admin.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const MODEL = "openai/gpt-6-astra";

export type DeptRow = {
  department: string;
  members: number;
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
  const { data, error } = await db.rpc("school_overview_v2", { _tenant_id: tenantId });
  if (error) throw new Error(error.message);
  return (data ?? []) as DeptRow[];
}

export function buildFacts(rows: DeptRow[]): string[] {
  const f: string[] = [];
  for (const r of rows) {
    f.push(
      `[${r.department}] việc đang mở ${r.open_tasks}, quá hạn ${r.overdue}, bị chặn ${r.blocked}, hoàn thành 7 ngày ${r.done_7d}, họp 7 ngày tới ${r.meetings_7d}`,
    );
    for (const t of r.overdue_titles ?? []) f.push(`[${r.department}] quá hạn: "${t}"`);
  }
  return f;
}

export async function generateBrief(
  db: Db,
  tenantId: string,
  department: string | null,
): Promise<{ status: "ok" | "no_data" | "error"; content: string; facts: string[] }> {
  const all = await loadOverview(db, tenantId);
  const rows = department ? all.filter((r) => r.department === department) : all;
  const facts = buildFacts(rows);
  const meetingLines: string[] = [];
  try {
    // Đồng bộ lịch họp 7 ngày tới vào bản tin (bỏ lịch đã hủy)
    const now = new Date();
    let mq = (db as any).from("meetings").select("title,start_at,end_at,location,department,status")
      .eq("tenant_id", tenantId).is("deleted_at", null).neq("status", "canceled")
      .gte("start_at", now.toISOString()).lt("start_at", new Date(now.getTime() + 7 * 864e5).toISOString())
      .order("start_at").limit(30);
    if (department) mq = mq.eq("department", department);
    const { data: ms } = await mq;
    for (const m of (ms ?? []) as { title: string; start_at: string; location: string | null; department: string | null }[]) {
      const at = new Date(m.start_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      facts.push(`[${m.department ?? "Toàn trường"}] họp: "${m.title}" lúc ${at}${m.location ? ` tại ${m.location}` : ""}`);
      meetingLines.push(`- ${at} · ${m.title}${m.location ? ` · ${m.location}` : ""}${department ? "" : ` · ${m.department ?? "Toàn trường"}`}`);
    }
  } catch {
    /* bỏ qua nếu không đọc được lịch */
  }
  const hasData = facts.length > 0 && (rows.some((r) => r.open_tasks + r.done_7d + r.meetings_7d > 0) || facts.some((f) => f.includes("] họp: ")));
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
      system: rules + (department ? `\nPhạm vi: chỉ ${department}.` : "\nPhạm vi: toàn trường."),
      prompt: `DỮ LIỆU THẬT (${new Date().toLocaleDateString("vi-VN")}):\n${facts.join("\n")}`,
      providerOptions: {
        openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
      },
    });
    let content = (await result.text).trim();
    // Luôn đảm bảo có mục lịch họp 7 ngày tới từ dữ liệu thật
    if (content && meetingLines.length && !/##\s*Lịch họp/i.test(content)) {
      content += `\n\n## Lịch họp 7 ngày tới\n${meetingLines.join("\n")}`;
    }
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
    const { data: id, error } = await admin.rpc("save_school_brief_v2", {
      _tenant_id: t.id,
      _department: null,
      _content: b.content,
      _facts: b.facts,
      _trigger: "scheduled",
      _status: b.status,
      _idempotency_key: `sched:${dateKey}`,
    });
    if (error || !id) continue;
    if (b.status === "ok") await admin.rpc("notify_school_brief", { _brief_id: id, _roles: c.roles ?? ["tenant_owner", "tenant_admin"] });
    created += 1;
    // Bản tin riêng cho từng tổ chuyên môn (kèm lịch họp của tổ)
    const depts = (await loadOverview(admin, t.id).catch(() => [])).map((r) => r.department).filter(Boolean);
    for (const dept of depts.slice(0, 30)) {
      const bd = await generateBrief(admin, t.id, dept);
      if (bd.status === "no_data") continue;
      const { error: de } = await admin.rpc("save_school_brief_v2", {
        _tenant_id: t.id, _department: dept, _content: bd.content, _facts: bd.facts,
        _trigger: "scheduled", _status: bd.status, _idempotency_key: `sched:${dateKey}:${dept}`,
      });
      if (!de) created += 1;
    }
  }
  return { created };
}

/** Soạn bài tin công khai (nháp) từ bản tin toàn trường mới nhất, theo Skill + bộ từ ngữ của gói. */
export async function draftSchoolNews(db: Db, tenantId: string) {
  const { data: briefs } = await db.rpc("list_school_briefs_v2", { _tenant_id: tenantId, _department: null, _limit: 10 });
  const brief = ((briefs ?? []) as Array<{ status: string; content: string; created_at: string }>).find((b) => b.status === "ok");
  if (!brief) throw new Error("NO_BRIEF");
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("NO_AI_BACKEND");
  const rows = await listPackRows(db, tenantId);
  const skillBody = effectiveItem(rows, "skill", "executive_brief")?.content?.["body"];
  const vocab = Object.entries(mergedVocabulary(rows).vi).slice(0, 60).map(([k, v]) => `${k} = ${v}`).join("\n");
  const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
  const provider = createLovableResponsesProvider(apiKey);
  const result = streamText({
    model: provider.responses(MODEL),
    system:
      (typeof skillBody === "string" && skillBody.trim() ? skillBody : DEFAULT_RULES) +
      `\n\nNHIỆM VỤ MỚI: viết lại bản tin nội bộ thành BÀI TIN CÔNG KHAI cho website nhà trường (phụ huynh, cộng đồng đọc).
Bắt buộc: không nêu tên người, không nêu thông tin học sinh, không nêu việc quá hạn/bị chặn/số liệu rủi ro nội bộ, không nêu tiêu đề công việc nội bộ; chỉ nêu hoạt động tích cực, lịch họp/sự kiện chung. Không bịa.
Dùng đúng các từ ngữ của nhà trường (nếu có):\n${vocab || "(không có)"}
Trả về đúng định dạng:
TIÊU ĐỀ: <≤ 90 ký tự>
TÓM TẮT: <1–2 câu>
---
<nội dung markdown, dùng ## cho tiêu đề mục, tối đa 300 từ>`,
    prompt: `BẢN TIN NỘI BỘ (${new Date(brief.created_at).toLocaleDateString("vi-VN")}):\n${brief.content}`,
    providerOptions: {
      openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
    },
  });
  const text = (await result.text).trim();
  if (!text) throw new Error("AI_ERROR");
  const [head, ...rest] = text.split(/\n-{3,}\n/);
  const title = head.match(/TIÊU ĐỀ:\s*(.+)/)?.[1]?.trim().slice(0, 200) || "Bản tin nhà trường";
  const summary = head.match(/TÓM TẮT:\s*(.+)/)?.[1]?.trim().slice(0, 1000) ?? "";
  return { title, summary, body: (rest.join("\n---\n") || text).trim() };
}
