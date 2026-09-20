/**
 * Máy chủ: báo cho quản trị viên tổ chức khi có công việc mới.
 * Ghi thông báo trong ứng dụng và gửi thông báo đẩy (nếu đã cấu hình VAPID).
 * Liên kết đính kèm trỏ tới báo cáo tuần của Kết quả công việc.
 */
export const WEEKLY_REPORT_LINK = "/work-products?report=weekly";

interface NewTaskInfo {
  taskId: string;
  workspaceId: string;
  title: string;
  actorId: string;
}

export async function notifyAdminsOfNewTask(info: NewTaskInfo): Promise<{ notified: number }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, tenant_id")
      .eq("id", info.workspaceId)
      .maybeSingle();
    const tenantId = (ws as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) return { notified: 0 };

    const { data: members } = await supabaseAdmin
      .from("tenant_members")
      .select("user_id, role, status")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("role", ["tenant_owner", "tenant_admin"]);

    const recipients = [
      ...new Set(
        ((members ?? []) as { user_id: string }[])
          .map((m) => m.user_id)
          .filter((id) => id && id !== info.actorId),
      ),
    ];
    if (recipients.length === 0) return { notified: 0 };

    const workspaceName = (ws as { name?: string } | null)?.name ?? "Không gian làm việc";
    const title = "Công việc mới";
    const body = `${info.title} · ${workspaceName}`;

    await supabaseAdmin.from("notifications").insert(
      recipients.map((userId) => ({
        user_id: userId,
        tenant_id: tenantId,
        workspace_id: info.workspaceId,
        type: "task.created",
        scope_type: "workspace",
        title,
        body,
        link: WEEKLY_REPORT_LINK,
        meta: { taskId: info.taskId, weeklyReport: WEEKLY_REPORT_LINK },
      })) as never,
    );

    const { sendPushToUsers } = await import("./push-dispatch.server");
    await sendPushToUsers(recipients, {
      title,
      body,
      url: WEEKLY_REPORT_LINK,
      tag: `task-${info.taskId}`,
    });

    return { notified: recipients.length };
  } catch {
    // Thông báo không được phép làm hỏng lệnh tạo công việc.
    return { notified: 0 };
  }
}
