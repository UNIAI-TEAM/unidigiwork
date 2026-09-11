// ĐÀO TẠO LẠI BỘ NÃO AI — phần lõi dùng chung cho: nút bấm trong giao diện và
// lịch chạy tự động hằng ngày (cron). Nhận sẵn client Supabase + tenant đã xác thực.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApiError } from "@/contracts/errors";
import { AI_ACTION_TYPES } from "@/domain/ai-actions/contracts";
import { AI_SKILL_KINDS } from "@/domain/workflow-agents/skills";
import { loadCeoOverview } from "./ceo.server";

const fail = (code: string, message: string) => new ApiError({ code: code as never, message });

export const AUTO_RETRAIN_MIN_INTERVAL_MS = 15 * 60 * 1000;

export async function computeWorkSignature(context: any, tenantId: string): Promise<string> {
  const [tasksRes, kpiRes] = await Promise.all([
    context.supabase
      .from("tasks")
      .select("id, status, progress_pct, updated_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(100),
    context.supabase
      .from("ceo_kpi_settings")
      .select("updated_at, targets, department_weights")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  const tasks = (tasksRes.data ?? []) as {
    id: string;
    status: string;
    progress_pct: number | null;
    updated_at: string | null;
  }[];
  const progressSum = tasks.reduce((s, t) => s + (t.progress_pct ?? 0), 0);
  const latest = tasks[0]?.updated_at ?? "";
  const statuses = tasks.map((t) => `${t.status}:${t.progress_pct ?? ""}`).join("|");
  const kpi = kpiRes.data as { updated_at?: string } | null;
  let hash = 0;
  const raw = `${statuses}#${progressSum}#${latest}#${kpi?.updated_at ?? ""}`;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  return `${tasks.length}-${progressSum}-${hash}`;
}

export async function recordRetrainMark(context: any, tenantId: string) {
  try {
    const signature = await computeWorkSignature(context, tenantId);
    await context.supabase.from("ceo_kpi_settings").upsert(
      {
        tenant_id: tenantId,
        auto_retrain_at: new Date().toISOString(),
        auto_retrain_signature: signature,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
  } catch {
    /* không chặn kết quả đào tạo nếu ghi dấu vết thất bại */
  }
}

/** Đọc dữ liệu thật của tổ chức, gọi AI và lưu tối đa 5 kỹ năng mới. */
export async function retrainSkillsForTenant(
  context: { supabase: any; userId: string },
  tenantId: string,
  workspaceId: string | null,
) {
  const [tasksRes, meetingsRes, notifsRes, proposalsRes, skillRes] = await Promise.all([
    context.supabase
      .from("tasks")
      .select(
        "title, status, priority, due_at, tags, updated_at, created_at, progress_pct, start_at, end_at",
      )
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(40),
    // Ưu tiên lịch họp sắp tới (từ 7 ngày trước trở đi) để đề xuất bám lịch thực tế.
    context.supabase
      .from("meetings")
      .select("title, agenda, start_at, end_at, location, status, project_id")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .gte("start_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order("start_at", { ascending: true })
      .limit(20),
    context.supabase
      .from("notifications")
      .select("type, title")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(30),
    context.supabase
      .from("ai_action_proposals")
      .select("title, action_type, status")
      .eq("tenant_id", tenantId)
      .eq("status", "SUCCEEDED")
      .order("created_at", { ascending: false })
      .limit(20),
    context.supabase
      .from("ai_skills")
      .select("code, name")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null),
  ]);

  const tasks = (tasksRes.data ?? []) as {
    title: string;
    status: string;
    priority: string | null;
    due_at: string | null;
    tags: string[] | null;
    updated_at: string | null;
    created_at: string | null;
    progress_pct: number | null;
    start_at: string | null;
    end_at: string | null;
  }[];
  const meetings = (meetingsRes.data ?? []) as {
    title: string;
    agenda: string | null;
    start_at: string;
    end_at: string | null;
    location: string | null;
    status: string | null;
    project_id: string | null;
  }[];
  // Tên dự án của các cuộc họp, để đề xuất bám lịch họp thật.
  const meetingProjectIds = Array.from(
    new Set(meetings.map((m) => m.project_id).filter((v): v is string => Boolean(v))),
  );
  const meetingProjectName = new Map<string, string>();
  if (meetingProjectIds.length) {
    const projRes = await context.supabase
      .from("projects")
      .select("id, name")
      .in("id", meetingProjectIds);
    for (const p of (projRes.data ?? []) as { id: string; name: string }[]) {
      meetingProjectName.set(p.id, p.name);
    }
  }
  // Thảo luận thật trong dự án: ghi chú dự án + bình luận dự án.
  const [projNotesRes, projCommentsRes] = await Promise.all([
    context.supabase
      .from("projects")
      .select("id, name, notes, description, status")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(20),
    context.supabase
      .from("project_comments")
      .select("project_id, body, author_id, created_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  const projectRows = (projNotesRes.data ?? []) as {
    id: string;
    name: string;
    notes: string | null;
    description: string | null;
    status: string | null;
  }[];
  const projectName = new Map(projectRows.map((p) => [p.id, p.name]));
  for (const [pid, pname] of projectName) meetingProjectName.set(pid, pname);
  const projectComments = (projCommentsRes.data ?? []) as {
    project_id: string;
    body: string;
    author_id: string;
    created_at: string;
  }[];
  const commentAuthorName = new Map<string, string>();
  const commentAuthorIds = Array.from(new Set(projectComments.map((c) => c.author_id)));
  if (commentAuthorIds.length) {
    const uRes = await context.supabase
      .from("users")
      .select("id, display_name, primary_email")
      .in("id", commentAuthorIds);
    for (const u of (uRes.data ?? []) as {
      id: string;
      display_name: string | null;
      primary_email: string | null;
    }[]) {
      commentAuthorName.set(u.id, u.display_name ?? u.primary_email ?? "Thành viên");
    }
  }
  const projectNoteLines = projectRows
    .filter((p) => (p.notes ?? "").trim() || (p.description ?? "").trim())
    .map(
      (p) =>
        `- [${p.name}${p.status ? "/" + p.status : ""}] ${(p.notes || p.description || "")
          .replace(/\s+/g, " ")
          .slice(0, 300)}`,
    );
  const projectCommentLines = projectComments.map(
    (c) =>
      `- [${projectName.get(c.project_id) ?? "Dự án"}] ${
        commentAuthorName.get(c.author_id) ?? "Thành viên"
      } (${c.created_at.slice(0, 10)}): ${c.body.replace(/\s+/g, " ").slice(0, 240)}`,
  );

  const notifs = (notifsRes.data ?? []) as { type: string; title: string }[];
  const proposals = (proposalsRes.data ?? []) as { title: string; action_type: string }[];
  const existing = (skillRes.data ?? []) as { code: string; name: string }[];

  // Vai trò thực tế: công việc đang được giao cho từng nhân sự AI.
  const [workersRes, aiTasksRes] = await Promise.all([
    context.supabase.from("ai_workers").select("id, name, role").eq("tenant_id", tenantId),
    context.supabase
      .from("tasks")
      .select("title, status, due_at, ai_worker_id, ai_execution_status")
      .eq("tenant_id", tenantId)
      .not("ai_worker_id", "is", null)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);
  const aiWorkers = (workersRes.data ?? []) as { id: string; name: string; role: string }[];
  const aiTasks = (aiTasksRes.data ?? []) as {
    title: string;
    status: string;
    due_at: string | null;
    ai_worker_id: string | null;
    ai_execution_status: string | null;
  }[];
  const roleLines = aiWorkers
    .map((w) => {
      const own = aiTasks.filter((t) => t.ai_worker_id === w.id);
      if (!own.length) return "";
      return [
        `- ${w.name} (${w.role}) đang phụ trách ${own.length} việc:`,
        ...own
          .slice(0, 8)
          .map(
            (t) =>
              `  · ${t.title} [${t.status}${t.ai_execution_status ? "/" + t.ai_execution_status : ""}${t.due_at ? "/hạn " + t.due_at.slice(0, 10) : ""}]`,
          ),
      ].join("\n");
    })
    .filter(Boolean);

  // Danh bạ nhân sự AI (gồm hồ sơ nhập từ Excel) để Bộ não biết vai trò thật hiện có.
  const rosterLines = aiWorkers.slice(0, 60).map((w) => `- ${w.name} — ${w.role}`);

  // DÒNG THỜI GIAN HOẠT ĐỘNG: ai làm gì, khi nào, kết quả ra sao.
  const [auditRes, execRes, commentRes] = await Promise.all([
    context.supabase
      .from("audit_events")
      .select("action, event_type, resource_type, actor_user_id, occurred_at")
      .eq("tenant_id", tenantId)
      .order("occurred_at", { ascending: false })
      .limit(60),
    context.supabase
      .from("ai_task_executions")
      .select(
        "deliverable_title, status, quality_status, quality_score, completed_at, created_at, created_by",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(25),
    context.supabase
      .from("task_comments")
      .select("body, author_id, created_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  const audits = (auditRes.data ?? []) as {
    action: string | null;
    event_type: string | null;
    resource_type: string | null;
    actor_user_id: string | null;
    occurred_at: string;
  }[];
  const execs = (execRes.data ?? []) as {
    deliverable_title: string | null;
    status: string;
    quality_status: string | null;
    quality_score: number | null;
    completed_at: string | null;
    created_at: string;
    created_by: string | null;
  }[];
  const comments = (commentRes.data ?? []) as {
    body: string;
    author_id: string | null;
    created_at: string;
  }[];
  const actorIds = [
    ...new Set(
      [
        ...audits.map((a) => a.actor_user_id),
        ...execs.map((e) => e.created_by),
        ...comments.map((c) => c.author_id),
      ].filter(Boolean) as string[],
    ),
  ].slice(0, 60);
  const actorName = new Map<string, string>();
  if (actorIds.length) {
    const { data: users } = await context.supabase
      .from("users")
      .select("id, display_name, primary_email")
      .in("id", actorIds);
    for (const u of (users ?? []) as {
      id: string;
      display_name: string | null;
      primary_email: string | null;
    }[]) {
      actorName.set(u.id, u.display_name ?? u.primary_email ?? "Thành viên");
    }
  }
  const who = (id: string | null) => (id ? (actorName.get(id) ?? "Thành viên") : "Hệ thống");
  const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "chưa rõ");
  const timelineLines = [
    ...audits
      .slice(0, 30)
      .map(
        (a) =>
          `- ${when(a.occurred_at)} · ${who(a.actor_user_id)} · ${a.action ?? a.event_type ?? "hành động"}${a.resource_type ? " trên " + a.resource_type : ""}`,
      ),
    ...execs.map(
      (e) =>
        `- ${when(e.completed_at ?? e.created_at)} · ${who(e.created_by)} · AI thực thi "${e.deliverable_title ?? "kết quả"}" → ${e.status}${e.quality_status ? "/" + e.quality_status : ""}${e.quality_score != null ? "/điểm " + e.quality_score : ""}`,
    ),
    ...comments.map(
      (c) =>
        `- ${when(c.created_at)} · ${who(c.author_id)} · bình luận: ${c.body.replace(/\s+/g, " ").slice(0, 120)}`,
    ),
  ];

  const sampled = tasks.length + meetings.length + notifs.length + proposals.length;
  if (sampled === 0) {
    throw fail(
      "NO_DATA",
      "Chưa có công việc, cuộc họp hay thông báo nào để AI học. Hãy thêm dữ liệu rồi thử lại.",
    );
  }

  // KPI THẬT TỪ CEO COMMAND CENTER: cùng nguồn số liệu với màn điều hành,
  // để đề xuất giao việc và cảnh báo bám đúng KPI đang hiển thị cho ban lãnh đạo.
  let ceoLines: string[] = [];
  let ceoKpi: {
    period: string;
    overdue: number;
    aiSharePct: number;
    meetingHours: number;
    upcomingMeetings: number;
    avgProgressPct: number;
    kpiScore: number | null;
  } | null = null;
  try {
    const ceo = await loadCeoOverview(context.supabase, tenantId, "month", workspaceId);
    ceoKpi = {
      period: ceo.period,
      overdue: ceo.totals.overdue,
      aiSharePct: ceo.split.aiSharePct,
      meetingHours: ceo.time.meetingHours,
      upcomingMeetings: ceo.time.upcomingMeetings,
      avgProgressPct: ceo.time.avgProgressPct,
      kpiScore: ceo.kpi.score ?? null,
    };
    ceoLines = [
      "KPI ĐIỀU HÀNH (CEO COMMAND CENTER — kỳ 30 ngày gần nhất, so với kỳ liền trước):",
      `- Việc mới: ${ceo.totals.tasks.current} (kỳ trước ${ceo.totals.tasks.previous}, thay đổi ${ceo.totals.tasks.changePct ?? "—"}%).`,
      `- Hoàn thành: ${ceo.totals.completed.current} (kỳ trước ${ceo.totals.completed.previous}, thay đổi ${ceo.totals.completed.changePct ?? "—"}%).`,
      `- Đang thực hiện: ${ceo.totals.inProgress}. Quá hạn: ${ceo.totals.overdue}.`,
      `- Chuyển dịch Người ↔ AI: người ${ceo.split.human}, AI ${ceo.split.ai}; AI đảm nhiệm ${ceo.split.aiSharePct}% (kỳ trước ${ceo.split.aiSharePrevPct}%).`,
      `- Thời gian: giờ người ${ceo.time.humanHours} (ƯỚC TÍNH, chưa có chấm công), giờ AI ${ceo.time.aiHours} (đo thật), ước tính tiết kiệm ${ceo.time.savedHours}, đòn bẩy AI ${ceo.time.leverage ?? "chưa đủ dữ liệu"}.`,
      `- Họp ĐÃ DIỄN RA trong kỳ: ${ceo.time.meetingHours} giờ. Họp SẮP TỚI (chưa tính KPI): ${ceo.time.upcomingMeetings} cuộc, ${ceo.time.upcomingMeetingHours} giờ.${
        ceo.time.nextMeeting
          ? ` Cuộc họp kế tiếp: ${ceo.time.nextMeeting.title} @${ceo.time.nextMeeting.startAt.slice(0, 16).replace("T", " ")}.`
          : " Chưa có cuộc họp nào sắp tới."
      }`,
      `- Tiến độ trung bình việc đang chạy: ${ceo.time.avgProgressPct}%.`,
      `- Chất lượng: ${ceo.quality.withResult}/${ceo.quality.tasksCreated} việc có kết quả (${ceo.quality.resultRate ?? "—"}%), đã review ${ceo.quality.reviewed}, đạt ${ceo.quality.passed} (${ceo.quality.passRate ?? "—"}%).`,
      ...(ceo.kpi.configured
        ? [
            "- KPI DO CEO TỰ ĐẶT (bắt buộc bám theo, không tự đặt mục tiêu khác):",
            ...ceo.kpi.rows
              .filter((r) => r.target !== null)
              .map(
                (r) =>
                  `  · ${r.label}: mục tiêu ${r.target}${r.unit === "%" ? "%" : ` ${r.unit}`}, thực tế ${r.actual ?? "—"}${r.unit === "%" ? "%" : ""} → ${r.ok ? "ĐẠT" : "CHƯA ĐẠT"}${r.achievedPct !== null ? ` (${r.achievedPct}%)` : ""}`,
              ),
            `  · Điểm KPI tổng hợp: ${ceo.kpi.score ?? "—"}%`,
          ]
        : ["- CEO chưa đặt KPI mục tiêu."]),
      ...(ceo.departments.length
        ? [
            "- BÁO CÁO BỘ PHẬN (người/AI · tổng · hoàn thành · quá hạn · giờ ước tính · đề xuất · %AI · trọng số):",
            ...ceo.departments.map(
              (d) =>
                `  · ${d.name}: ${d.human}/${d.ai} · tổng ${d.total} · hoàn thành ${d.completed} · quá hạn ${d.overdue} · ${d.hoursEstimated} giờ (ước tính) · ${d.proposals} đề xuất · AI ${d.aiSharePct}% · trọng số ${d.weight}`,
            ),
          ]
        : []),
      ...(ceo.people.length
        ? [
            "- Khối lượng theo nhân sự (loại · việc · hoàn thành · giờ · đạt review):",
            ...ceo.people
              .slice(0, 15)
              .map(
                (p) =>
                  `  · ${p.name} · ${p.kind === "ai" ? "AI" : "Người"} · ${p.tasks} · ${p.completed} · ${p.hours}${p.hoursEstimated ? " (ước tính)" : ""} · ${p.reviewPassRate ?? "—"}%`,
              ),
          ]
        : []),
      ...(ceo.issues.length
        ? [
            "- Vấn đề CEO đang nhìn thấy:",
            ...ceo.issues.map((i) => `  · [${i.kind}] ${i.title} — ${i.detail}`),
          ]
        : []),
    ];
  } catch {
    ceoLines = [];
  }

  const now = Date.now();
  const DAY = 86_400_000;
  const overdue = tasks.filter(
    (t) => t.due_at && new Date(t.due_at).getTime() < now && t.status !== "done",
  ).length;
  const byStatus = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const done = byStatus["done"] ?? 0;
  const inProgress = byStatus["in_progress"] ?? 0;
  const blocked = byStatus["blocked"] ?? 0;
  const todo = byStatus["todo"] ?? 0;
  const completionRate = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const stale = tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.status !== "canceled" &&
      t.updated_at &&
      now - new Date(t.updated_at).getTime() > 7 * DAY,
  );
  const dueSoon = tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.status !== "canceled" &&
      t.due_at &&
      new Date(t.due_at).getTime() >= now &&
      new Date(t.due_at).getTime() <= now + 7 * DAY,
  );
  const noDue = tasks.filter(
    (t) => !t.due_at && t.status !== "done" && t.status !== "canceled",
  ).length;
  const progressLines = [
    "TIẾN ĐỘ THỰC TẾ:",
    `- Phân bố trạng thái: chờ làm ${todo}, đang làm ${inProgress}, bị chặn ${blocked}, hoàn thành ${done}, tỉ lệ hoàn thành ${completionRate}%.`,
    `- Quá hạn: ${overdue}. Đến hạn trong 7 ngày: ${dueSoon.length}. Chưa đặt hạn: ${noDue}. Không cập nhật quá 7 ngày: ${stale.length}.`,
    ...stale
      .slice(0, 10)
      .map(
        (t) =>
          `- Ì ạch: ${t.title} [${t.status}] cập nhật lần cuối ${(t.updated_at ?? "").slice(0, 10)}`,
      ),
    ...dueSoon
      .slice(0, 10)
      .map((t) => `- Sắp đến hạn: ${t.title} [${t.status}] hạn ${(t.due_at ?? "").slice(0, 10)}`),
    `- % hoàn thành trung bình: ${
      tasks.length
        ? Math.round(tasks.reduce((s, t) => s + (t.progress_pct ?? 0), 0) / tasks.length)
        : 0
    }%. Việc đang làm nhưng 0%: ${
      tasks.filter((t) => t.status === "in_progress" && (t.progress_pct ?? 0) === 0).length
    }. Việc ≥80% nhưng chưa hoàn thành: ${
      tasks.filter((t) => (t.progress_pct ?? 0) >= 80 && t.status !== "done").length
    }.`,
    ...tasks
      .filter((t) => (t.progress_pct ?? 0) > 0 || t.start_at || t.end_at)
      .slice(0, 15)
      .map(
        (t) =>
          `- Tiến độ: ${t.title} [${t.status}] ${t.progress_pct ?? 0}%${
            t.start_at ? " bắt đầu " + t.start_at.slice(0, 10) : ""
          }${t.end_at ? " kết thúc " + t.end_at.slice(0, 10) : ""}`,
      ),
  ];

  const corpus = [
    ceoLines.length
      ? `NGUỒN SỐ LIỆU CHÍNH: BÁO CÁO CEO COMMAND CENTER dưới đây, chốt lúc ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Mọi kỹ năng phải bám đúng các con số của lần chạy này.`
      : "Không lấy được báo cáo CEO Command Center trong lần chạy này.",
    ...ceoLines,
    `Số liệu bổ sung: ${tasks.length} công việc gần đây (${overdue} quá hạn), ${meetings.length} cuộc họp, ${notifs.length} thông báo, ${proposals.length} đề xuất đã duyệt.`,
    "LỊCH HỌP THẬT (sắp xếp theo thời gian, gồm cuộc họp sắp tới):",
    ...meetings.map((m) => {
      const proj = m.project_id ? meetingProjectName.get(m.project_id) : null;
      const when = m.start_at ? m.start_at.slice(0, 16).replace("T", " ") : "";
      const upcoming = m.start_at ? new Date(m.start_at).getTime() >= Date.now() : false;
      return `- ${m.title}${proj ? " [dự án: " + proj + "]" : ""}${
        when ? " @" + when : ""
      }${upcoming ? " (sắp tới)" : ""}${m.location ? " tại " + m.location : ""}${
        m.status ? " (" + m.status + ")" : ""
      }${m.agenda ? ": " + m.agenda.slice(0, 160) : ""}`;
    }),
    ...progressLines,
    ...(rosterLines.length ? ["DANH BẠ NHÂN SỰ AI (vai trò thật):", ...rosterLines] : []),
    ...(roleLines.length ? ["VAI TRÒ NHÂN SỰ AI (việc đang được giao):", ...roleLines] : []),
    ...(timelineLines.length
      ? ["DÒNG THỜI GIAN HOẠT ĐỘNG (ai làm gì, khi nào, kết quả):", ...timelineLines]
      : []),
    "CÔNG VIỆC:",
    ...tasks.map(
      (t) =>
        `- ${t.title} [${t.status}${t.priority ? "/" + t.priority : ""}${
          t.due_at ? "/hạn " + t.due_at.slice(0, 10) : ""
        }]${(t.tags ?? []).length ? " #" + (t.tags ?? []).join(" #") : ""}`,
    ),
    ...(projectNoteLines.length ? ["GHI CHÚ DỰ ÁN:", ...projectNoteLines] : []),
    ...(projectCommentLines.length
      ? ["THẢO LUẬN TRONG DỰ ÁN (bình luận thật):", ...projectCommentLines]
      : []),
    "THÔNG BÁO:",
    ...notifs.map((n) => `- [${n.type}] ${n.title}`),
    "ĐỀ XUẤT ĐÃ DUYỆT:",
    ...proposals.map((p) => `- [${p.action_type}] ${p.title}`),
    "KỸ NĂNG ĐÃ CÓ (không lặp lại):",
    ...existing.map((s) => `- ${s.code}: ${s.name}`),
  ]
    .join("\n")
    .slice(0, 12000);

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw fail("AI_PROVIDER_UNAVAILABLE", "Trợ lý AI hiện chưa sẵn sàng.");
  const { streamText } = await import("ai");
  const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
  const provider = createLovableResponsesProvider(apiKey);

  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    providerOptions: {
      openai: { forceReasoning: true, reasoningEffort: "low", store: false },
    },
    system:
      "Bạn thiết kế kỹ năng AI cho nền tảng công việc UNIWORK dựa trên dữ liệu thật của một tổ chức. " +
      "Tìm các tình huống LẶP LẠI trong dữ liệu và đề xuất tối đa 5 kỹ năng thực sự hữu ích, bằng tiếng Việt. " +
      'CHỈ trả về JSON thuần dạng {"skills":[{"name":string,"code":string,"kind":string,"description":string,"example":string,"actionTypes":string[]}]}. ' +
      `code: CHỮ HOA A-Z 0-9 _ (2-40 ký tự), không trùng kỹ năng đã có. kind ∈ ${AI_SKILL_KINDS.join("|")}. ` +
      `actionTypes: chỉ trong ${AI_ACTION_TYPES.join(",")}; rỗng nếu chỉ tra cứu/phân tích/soạn thảo. ` +
      "Ưu tiên các kỹ năng bám sát TIẾN ĐỘ THỰC TẾ: việc quá hạn, việc bị chặn, việc ì ạch không cập nhật, việc sắp đến hạn, việc thiếu hạn. " +
      "Đọc kỹ DÒNG THỜI GIAN HOẠT ĐỘNG để hiểu ai thường làm gì, vào lúc nào và kết quả ra sao; ưu tiên kỹ năng lặp lại theo thói quen làm việc thật đó. " +
      "Dùng LỊCH HỌP THẬT làm mốc thời gian: kỹ năng liên quan tới họp phải bám đúng cuộc họp có thật (tên, dự án, ngày giờ, địa điểm), " +
      "ví dụ chuẩn bị tài liệu trước cuộc họp sắp tới, đối soát việc cần chốt trong cuộc họp đó, theo dõi sau họp. TUYỆT ĐỐI không bịa cuộc họp không có trong dữ liệu. " +
      "BẮT BUỘC: nếu phần LỊCH HỌP THẬT có ít nhất một cuộc họp, ít nhất 1 kỹ năng trả về phải gắn với cuộc họp có thật đó và nêu đúng tên cuộc họp cùng ngày giờ. " +
      "QUAN TRỌNG NHẤT: nếu CEO đã đặt KPI mục tiêu, ưu tiên tuyệt đối các KPI CHƯA ĐẠT và các bộ phận có trọng số cao hơn khi đề xuất giao việc và cảnh báo. " +
      "Nếu có phần KPI ĐIỀU HÀNH (CEO COMMAND CENTER), ít nhất 3 trong số kỹ năng trả về phải bám trực tiếp vào các KPI đó — " +
      "giao việc theo khối lượng và giờ làm của từng nhân sự (người và AI), cảnh báo khi số việc quá hạn hoặc tỉ lệ review đạt xấu đi so với kỳ trước, " +
      "theo dõi tỉ lệ chuyển dịch Người ↔ AI và tỉ lệ việc có kết quả. Mỗi kỹ năng như vậy phải nêu ĐÚNG con số KPI quan sát được và ngưỡng kích hoạt cụ thể. " +
      "Báo cáo CEO Command Center là nguồn số liệu chính và được chốt lại ở MỖI LẦN chạy: mỗi kỹ năng phải trích đúng con số của lần chạy này " +
      "(việc mới, hoàn thành, quá hạn, tiến độ trung bình, giờ họp đã diễn ra, giờ người/AI, tỉ lệ review, số liệu từng bộ phận) kèm ngưỡng kích hoạt so với kỳ trước. " +
      "Chỉ dùng cuộc họp SẮP TỚI để chuẩn bị; họp đã diễn ra chỉ để đối chiếu giờ. " +
      "Không được lấy lịch họp cũ làm căn cứ chính khi KPI đã cho thấy vấn đề khác. Giờ người là ƯỚC TÍNH — phải nói rõ, không coi là chấm công. " +
      "Không bịa doanh thu, chi phí hay bất kỳ số nào không có trong dữ liệu. " +
      "description phải nhắc tới bằng chứng cụ thể quan sát được trong dữ liệu (tên việc, trạng thái, số liệu KPI, tên và thời gian cuộc họp).",
    prompt: corpus,
  });

  const text = (await result.text) ?? "";
  const raw = text.replace(/```json|```/g, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw fail("AI_ERROR", "AI chưa học được kỹ năng, hãy thử lại.");
  let parsed: { skills?: unknown };
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as { skills?: unknown };
  } catch {
    throw fail("AI_ERROR", "AI chưa học được kỹ năng, hãy thử lại.");
  }

  const kinds = AI_SKILL_KINDS as readonly string[];
  const actions = AI_ACTION_TYPES as readonly string[];
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const takenCodes = new Set(existing.map((s) => s.code));
  const takenNames = new Set(existing.map((s) => s.name.toLowerCase()));

  const rows: Record<string, unknown>[] = [];
  for (const item of (Array.isArray(parsed.skills) ? parsed.skills : []).slice(0, 5)) {
    const s = item as Record<string, unknown>;
    const name = str(s["name"], 200);
    if (!name || takenNames.has(name.toLowerCase())) continue;
    let code =
      str(s["code"], 40)
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_")
        .replace(/^_+|_+$/g, "") || "SKILL_HOC";
    let n = 2;
    const base = code.slice(0, 52);
    while (takenCodes.has(code)) code = `${base}_${n++}`;
    takenCodes.add(code);
    takenNames.add(name.toLowerCase());
    rows.push({
      tenant_id: tenantId,
      workspace_id: null,
      code,
      name,
      kind: kinds.includes(String(s["kind"])) ? String(s["kind"]) : "ANALYSIS",
      description: str(s["description"], 2000),
      example: str(s["example"], 500),
      action_types: Array.isArray(s["actionTypes"])
        ? (s["actionTypes"] as unknown[]).map(String).filter((a) => actions.includes(a))
        : [],
      sources: ["WORKFLOW_AGENT"],
      enabled: true,
      is_system: false,
      created_by: context.userId,
      updated_by: context.userId,
    });
  }

  if (rows.length > 0) {
    const { error } = await context.supabase.from("ai_skills").insert(rows as never);
    if (error) throw fail("AI_SKILL_SAVE_FAILED", error.message);
  }

  // Ghi lại dấu vết dữ liệu đã học để chế độ tự động không chạy lặp vô ích.
  await recordRetrainMark(context, tenantId);

  return {
    created: rows.length,
    names: rows.map((r) => r["name"] as string),
    sampled: {
      tasks: tasks.length,
      overdueTasks: overdue,
      meetings: meetings.length,
      notifications: notifs.length,
      approvedProposals: proposals.length,
      ceoKpi,
    },
  };
}
