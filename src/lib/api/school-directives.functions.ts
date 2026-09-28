// Skill school-directive-tracker: chế độ inspect (chỉ đọc). Chỉ đạo = quyết định của tổ chức; trạng thái nghiệp vụ là lớp diễn giải.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { streamText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { schoolContext } from "./school-ops.functions";

export type DirectiveState = "decide" | "blocked" | "overdue" | "review" | "closed" | "progress";
export type DirectiveTask = {
  id: string; title: string; status: string; due_at: string | null; owner: string | null;
  evidence: number; updated_at: string | null; overdue: boolean;
};
export type Directive = {
  id: string; title: string; detail: string | null; status: string; created_at: string;
  confirmed_at: string | null; accepted_at: string | null; note: string | null; meeting: { id: string; title: string; start_at: string | null } | null;
  state: DirectiveState; missingEvidence: boolean; next: string; why: string | null; tasks: DirectiveTask[];
};

type Row = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadDirectives(sb: any, userId: string, scope: "bgh" | "dept" = "bgh") {
    const ctx = await schoolContext(sb as never, userId);
    if (!ctx) return { enabled: false as const, allowed: false, items: [] as Directive[] };
    if (scope === "bgh" && ctx.role !== "bgh") return { enabled: true as const, allowed: false, items: [] as Directive[], dept: null as string | null };
    if (scope === "dept" && (ctx.role !== "lead" || !ctx.dept)) return { enabled: true as const, allowed: false, items: [] as Directive[], dept: null as string | null };
    let deptUsers: Set<string> | null = null;
    if (scope === "dept") {
      const { data: mem } = await sb.from("tenant_member_profiles").select("user_id").eq("tenant_id", ctx.tenantId).eq("department", ctx.dept);
      deptUsers = new Set(((mem ?? []) as Row[]).map((m) => m.user_id as string));
    }

    const { data: decs } = await sb
      .from("decisions")
      .select("id,title,detail,status,source_type,source_id,created_at,confirmed_at,accepted_at,acceptance_note")
      .eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }).limit(200);
    const list = (decs ?? []) as Row[];
    const meetingIds = [...new Set(list.filter((d) => d.source_type === "MEETING" || d.source_type === "meeting").map((d) => d.source_id as string).filter(Boolean))];

    const [{ data: meets }, { data: items }] = await Promise.all([
      meetingIds.length ? sb.from("meetings").select("id,title,start_at,department").in("id", meetingIds) : Promise.resolve({ data: [] }),
      meetingIds.length ? sb.from("meeting_action_item_states").select("meeting_id,task_id").in("meeting_id", meetingIds).not("task_id", "is", null) : Promise.resolve({ data: [] }),
    ]);
    const taskIds = [...new Set(((items ?? []) as Row[]).map((i) => i.task_id as string))];
    const [{ data: tasks }, { data: atts }] = await Promise.all([
      taskIds.length ? sb.from("tasks").select("id,title,status,due_at,human_owner_id,updated_at").in("id", taskIds).then((r: { data: Row[] | null }) => ({ data: deptUsers ? (r.data ?? []).filter((t) => deptUsers!.has(t.human_owner_id as string)) : r.data })) : Promise.resolve({ data: [] }),
      taskIds.length ? sb.from("task_attachments").select("task_id").in("task_id", taskIds) : Promise.resolve({ data: [] }),
    ]);
    const ownerIds = [...new Set(((tasks ?? []) as Row[]).map((t) => t.human_owner_id as string).filter(Boolean))];
    const { data: profs } = ownerIds.length
      ? await sb.from("profiles").select("id,display_name,email").in("id", ownerIds)
      : { data: [] };
    const name = new Map(((profs ?? []) as Row[]).map((p) => [p.id as string, (p.display_name || p.email) as string]));
    const evCount = new Map<string, number>();
    for (const a of (atts ?? []) as Row[]) evCount.set(a.task_id as string, (evCount.get(a.task_id as string) ?? 0) + 1);
    const now = Date.now();
    const taskMap = new Map(((tasks ?? []) as Row[]).map((t) => {
      const done = t.status === "done" || t.status === "canceled";
      return [t.id as string, {
        id: t.id as string, title: t.title as string, status: t.status as string, due_at: (t.due_at as string) ?? null,
        owner: t.human_owner_id ? name.get(t.human_owner_id as string) ?? null : null,
        evidence: evCount.get(t.id as string) ?? 0, updated_at: (t.updated_at as string) ?? null,
        overdue: !done && !!t.due_at && new Date(t.due_at as string).getTime() < now,
      } satisfies DirectiveTask];
    }));
    const byMeeting = new Map<string, DirectiveTask[]>();
    for (const i of (items ?? []) as Row[]) {
      const t = taskMap.get(i.task_id as string);
      if (!t) continue;
      const arr = byMeeting.get(i.meeting_id as string) ?? [];
      arr.push(t);
      byMeeting.set(i.meeting_id as string, arr);
    }
    const meetMap = new Map(((meets ?? []) as Row[]).map((m) => [m.id as string, { id: m.id as string, title: m.title as string, start_at: (m.start_at as string) ?? null }]));

    const meetDept = new Map(((meets ?? []) as Row[]).map((m) => [m.id as string, (m.department as string) ?? null]));
    const scoped = deptUsers ? list.filter((d) => (byMeeting.get(d.source_id as string)?.length ?? 0) > 0 || meetDept.get(d.source_id as string) === ctx.dept) : list;
    const out: Directive[] = scoped.map((d) => {
      const status = String(d.status ?? "").toUpperCase();
      const mid = d.source_id as string;
      const ts = byMeeting.get(mid) ?? [];
      const open = ts.filter((t) => t.status !== "done" && t.status !== "canceled");
      const doneNoEv = ts.some((t) => t.status === "done" && t.evidence === 0);
      let state: DirectiveState; let next: string; let why: string | null = null;
      if (d.accepted_at) { state = "closed"; next = "sdt.n.closed"; }
      else if (["REJECTED", "SUPERSEDED", "CANCELED", "CANCELLED"].includes(status)) { state = "closed"; next = "sdt.n.closed"; }
      else if (status !== "CONFIRMED") { state = "decide"; next = "sdt.n.decide"; }
      else if (ts.some((t) => t.status === "blocked")) { state = "blocked"; next = "sdt.n.blocked"; why = ts.find((t) => t.status === "blocked")!.title; }
      else if (ts.some((t) => t.overdue)) { state = "overdue"; next = "sdt.n.overdue"; why = ts.find((t) => t.overdue)!.title; }
      else if (ts.length > 0 && open.length === 0) { state = "review"; next = doneNoEv ? "sdt.n.evidence" : "sdt.n.review"; }
      else { state = "progress"; next = ts.length ? "sdt.n.progress" : "sdt.n.assign"; }
      return {
        id: d.id as string, title: d.title as string, detail: (d.detail as string) ?? null, status,
        created_at: d.created_at as string, confirmed_at: (d.confirmed_at as string) ?? null, accepted_at: (d.accepted_at as string) ?? null, note: (d.acceptance_note as string) || null,
        meeting: meetMap.get(mid) ?? null, state, missingEvidence: doneNoEv, next, why, tasks: ts,
      };
    });
    return { enabled: true as const, allowed: true, items: out, dept: scope === "dept" ? ctx.dept : null };
}

export const listSchoolDirectives = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadDirectives(context.supabase, context.userId));

// Tổ trưởng: chỉ chỉ đạo có việc do người trong tổ phụ trách hoặc họp của tổ; chỉ việc của tổ.
export const listDeptDirectives = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadDirectives(context.supabase, context.userId, "dept"));

/** Nghiệm thu hoặc yêu cầu sửa — chỉ BGH, sau khi người dùng bấm xác nhận. */
export const reviewSchoolDirective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), accept: z.boolean(), note: z.string().max(2000).default(""), idempotencyKey: z.string().min(8).max(200) }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("school_review_directive", {
      _decision_id: data.id, _accept: data.accept, _note: data.note, _idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(/[A-Z_]{6,}/.exec(error.message)?.[0] ?? "DIRECTIVE_REVIEW_FAILED");
    return { ok: true };
  });

/** Skill school-directive-tracker, chế độ inspect: AI phân tích một chỉ đạo từ dữ liệu thật (chỉ đọc). */
export const inspectSchoolDirective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx || ctx.role !== "bgh") throw new Error("DIRECTIVE_ACCESS_DENIED");
    const all = await loadDirectives(context.supabase, context.userId);
    const d = all.items.find((x) => x.id === data.id);
    if (!d) throw new Error("DECISION_NOT_FOUND");
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("NO_AI_BACKEND");
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
    const provider = createLovableResponsesProvider(apiKey);
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      system: [
        "Bạn là Skill school-directive-tracker (chế độ inspect, chỉ đọc) cho Ban Giám hiệu.",
        "Chỉ dùng DỮ LIỆU được cung cấp. Không bịa nguyên nhân; nếu không rõ ghi 'chưa rõ nguyên nhân'.",
        "Không chấm điểm hay nhận xét con người (lười/chậm). Không nêu thông tin học sinh.",
        "AI không tự nghiệm thu, không đóng chỉ đạo, không gửi nhắc việc; chỉ gợi ý người cần xác nhận.",
        "Phân biệt: Done nhưng thiếu minh chứng ≠ chờ nghiệm thu ≠ đã nghiệm thu.",
        "Trả markdown ngắn tiếng Việt: ## Hiện trạng · ## Vì sao (kèm tên công việc làm nguồn) · ## Việc tiếp theo (ai làm, cần ai xác nhận).",
      ].join("\n"),
      prompt: JSON.stringify({ asOf: new Date().toISOString(), directive: d }),
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
    });
    const text = (await result.text).trim();
    if (!text) throw new Error("AI_EMPTY");
    return { text };
  });
