// HUMAN AGENT — chọn người thật để giao việc khi không có nhân sự AI phù hợp.
// Tín hiệu dùng để chọn đều là dữ liệu thật trong không gian làm việc:
//   1) kinh nghiệm: số việc đã/đang làm có tiêu đề trùng từ khoá với việc mới
//   2) tải hiện tại: số việc đang mở (todo/in_progress) đang gánh
// Không suy diễn kỹ năng không có trong dữ liệu; không mặc định giao cho admin.

const OPEN_STATUSES = ["todo", "in_progress", "blocked"] as const;

export interface HumanAssignment {
  userId: string;
  name: string;
  reason: string;
  openTasks: number;
}

const STOP_WORDS = new Set([
  "cho",
  "các",
  "cac",
  "công",
  "cong",
  "việc",
  "viec",
  "và",
  "va",
  "của",
  "cua",
  "với",
  "voi",
  "trong",
  "một",
  "mot",
  "này",
  "nay",
  "tạo",
  "tao",
  "làm",
  "lam",
  "giao",
  "về",
  "ve",
  "theo",
]);

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const keywordsOf = (value: string) =>
  Array.from(
    new Set(
      normalize(value)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
    ),
  );

/**
 * Chọn người phụ trách thật cho một công việc trong workspace.
 * Trả về `null` khi workspace không có thành viên nào khả dụng.
 */
export async function pickHumanAssignee(args: {
  supabase: any;
  workspaceId: string;
  task: { title?: string | null; description?: string | null };
  preferUserId?: string | null;
}): Promise<HumanAssignment | null> {
  const { supabase, workspaceId, task, preferUserId } = args;
  try {
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .limit(200);
    const memberIds: string[] = Array.from(
      new Set((members ?? []).map((m: any) => m.user_id).filter(Boolean)),
    );
    if (memberIds.length === 0) return null;

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", memberIds);
    const nameOf = new Map<string, string>(
      (profiles ?? []).map((p: any) => [p.id as string, (p.display_name || p.email) as string]),
    );

    // Việc thật của workspace để tính tải và kinh nghiệm (giới hạn để không quét toàn bộ).
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, status")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    const taskRows = (tasks ?? []) as Array<{ id: string; title: string; status: string }>;
    const taskById = new Map(taskRows.map((row) => [row.id, row]));

    const { data: links } = await supabase
      .from("task_assignees")
      .select("task_id, user_id")
      .in(
        "task_id",
        taskRows.slice(0, 500).map((row) => row.id),
      );

    const wanted = keywordsOf(`${task.title ?? ""} ${task.description ?? ""}`);
    const load = new Map<string, number>();
    const experience = new Map<string, number>();
    for (const link of (links ?? []) as Array<{ task_id: string; user_id: string }>) {
      const row = taskById.get(link.task_id);
      if (!row || !memberIds.includes(link.user_id)) continue;
      if ((OPEN_STATUSES as readonly string[]).includes(row.status)) {
        load.set(link.user_id, (load.get(link.user_id) ?? 0) + 1);
      }
      if (wanted.length > 0) {
        const titleWords = new Set(keywordsOf(row.title ?? ""));
        const overlap = wanted.filter((word) => titleWords.has(word)).length;
        if (overlap > 0) {
          experience.set(link.user_id, (experience.get(link.user_id) ?? 0) + overlap);
        }
      }
    }

    const ranked = memberIds
      .map((userId) => ({
        userId,
        name: nameOf.get(userId) ?? "Thành viên",
        openTasks: load.get(userId) ?? 0,
        experience: experience.get(userId) ?? 0,
        preferred: preferUserId === userId ? 1 : 0,
      }))
      .sort(
        (a, b) =>
          b.experience - a.experience ||
          a.openTasks - b.openTasks ||
          b.preferred - a.preferred ||
          a.name.localeCompare(b.name),
      );

    const best = ranked[0];
    if (!best) return null;
    const reason =
      best.experience > 0
        ? `Đã xử lý ${best.experience} việc tương tự, đang mở ${best.openTasks} việc`
        : `Đang mở ít việc nhất (${best.openTasks} việc) trong không gian làm việc`;
    return { userId: best.userId, name: best.name, reason, openTasks: best.openTasks };
  } catch {
    return null;
  }
}
