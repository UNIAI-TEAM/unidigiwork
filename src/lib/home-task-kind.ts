// Phân loại dòng My Work để hiển thị quick actions phù hợp theo nguồn liên quan.
import type { HomeTask } from "@/lib/api/home.functions";

export type TaskKind = "email" | "meeting" | "chat" | "document" | "task";

const RULES: Array<{ kind: TaskKind; re: RegExp }> = [
  { kind: "email", re: /(email|e-mail|mail|thư|inbox|hộp thư|reply|trả lời thư)/i },
  { kind: "meeting", re: /(họp|meeting|cuộc gọi|call|lịch họp|standup|review meeting)/i },
  { kind: "chat", re: /(chat|tin nhắn|message|mention|nhắc đến|kênh|channel|dm)/i },
  { kind: "document", re: /(tài liệu|document|doc|hợp đồng|báo cáo|tài liệu hoá|file|pdf|biên bản)/i },
];

export function getTaskKind(task: Pick<HomeTask, "title"> & { tags?: string[] | null }): TaskKind {
  const haystack = [task.title, ...(task.tags ?? [])].join(" ");
  for (const r of RULES) if (r.re.test(haystack)) return r.kind;
  return "task";
}

export const TASK_KIND_META: Record<
  TaskKind,
  { label: string; openLabel: string; to: string }
> = {
  email: { label: "Email", openLabel: "Mở Email", to: "/email" },
  meeting: { label: "Cuộc họp", openLabel: "Mở Cuộc họp", to: "/meeting" },
  chat: { label: "Tin nhắn", openLabel: "Mở Chat", to: "/chat" },
  document: { label: "Tài liệu", openLabel: "Mở Tài liệu", to: "/documents" },
  task: { label: "Công việc", openLabel: "Mở Công việc", to: "/tasks" },
};
