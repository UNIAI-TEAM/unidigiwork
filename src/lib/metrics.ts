/**
 * Tiêu chí đếm dùng chung giữa dashboard (đếm ở server) và các trang đích (lọc ở client).
 * Mọi thay đổi tiêu chí phải sửa ở đây để hai bên luôn khớp số.
 */

export const STALE_DOC_DAYS = 30;

/** Task quá hạn: có due_at, đã qua hạn, và chưa ở trạng thái kết thúc (done/canceled). */
export const TASK_TERMINAL_STATUSES = ["done", "canceled"] as const;

export function isOverdueTask(
  t: { due_at?: string | null; status?: string | null; deleted_at?: string | null },
  now: Date = new Date(),
): boolean {
  if (t.deleted_at) return false;
  if (!t.due_at) return false;
  if (TASK_TERMINAL_STATUSES.includes((t.status ?? "") as (typeof TASK_TERMINAL_STATUSES)[number]))
    return false;
  return new Date(t.due_at).getTime() < now.getTime();
}

/** Tài liệu cần cập nhật: chưa xoá và updated_at cũ hơn 30 ngày. */
export function isStaleDocument(
  d: { updated_at: string; deleted_at?: string | null },
  now: Date = new Date(),
): boolean {
  if (d.deleted_at) return false;
  return now.getTime() - new Date(d.updated_at).getTime() > STALE_DOC_DAYS * 86400_000;
}

/** Cuộc họp hôm nay: start_at nằm trong [đầu ngày, đầu ngày hôm sau) theo giờ địa phương. */
export function isMeetingOnDay(
  m: { start_at?: string | null; deleted_at?: string | null },
  day: Date = new Date(),
): boolean {
  if (m.deleted_at) return false;
  if (!m.start_at) return false;
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400_000);
  const at = new Date(m.start_at).getTime();
  return at >= start.getTime() && at < end.getTime();
}

/** Quy trình chờ duyệt: yêu cầu truy cập ở trạng thái pending. */
export function isPendingWorkflowApproval(r: { status?: string | null }): boolean {
  return r.status === "pending";
}

/** YYYY-MM-DD theo giờ địa phương (dùng cho search param của lịch). */
export function localDayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
