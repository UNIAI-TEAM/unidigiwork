/**
 * Máy chủ: khi có công việc mới, đăng thông báo vào phòng chat của công việc
 * (dòng thời gian công việc) và phòng chat chung của tổ chức.
 * Ghi qua RLS của người dùng; phòng được tạo idempotent bởi RPC.
 * Best-effort: lỗi ở đây không được làm hỏng lệnh tạo công việc.
 */

type SupabaseLike = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  from: (table: string) => any;
};

interface AnnounceInput {
  supabase: SupabaseLike;
  userId: string;
  taskId: string;
  title: string;
  dueAt?: string | null;
}

function formatDue(dueAt?: string | null): string {
  if (!dueAt) return "chưa đặt hạn";
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return "chưa đặt hạn";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);
}

export async function announceTaskCreatedInRooms(
  input: AnnounceInput,
): Promise<{ taskChannelId: string | null; generalChannelId: string | null }> {
  const { supabase, userId, taskId, title } = input;
  const result = { taskChannelId: null as string | null, generalChannelId: null as string | null };
  try {
    const { data: taskChannelId } = await supabase.rpc("ensure_task_chat_channel", {
      _task_id: taskId,
    });
    if (!taskChannelId) return result;
    result.taskChannelId = taskChannelId as string;

    const { data: ch } = await supabase
      .from("chat_channels")
      .select("tenant_id")
      .eq("id", taskChannelId as string)
      .maybeSingle();
    const tenantId = (ch as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) return result;

    const due = formatDue(input.dueAt);
    const taskBody = `Công việc mới: ${title}\nHạn: ${due}`;
    await supabase.from("chat_messages").insert({
      channel_id: taskChannelId as string,
      tenant_id: tenantId,
      author_id: userId,
      body: taskBody,
    });

    const { data: generalChannelId } = await supabase.rpc("ensure_tenant_general_channel", {
      _tenant_id: tenantId,
    });
    if (!generalChannelId) return result;
    result.generalChannelId = generalChannelId as string;

    await supabase.from("chat_messages").insert({
      channel_id: generalChannelId as string,
      tenant_id: tenantId,
      author_id: userId,
      body: `${taskBody}\nMở công việc: /m/tasks/${taskId}`,
    });
    return result;
  } catch {
    return result;
  }
}
