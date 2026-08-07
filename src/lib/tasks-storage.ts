// Lưu trữ tệp đính kèm công việc trên bucket riêng "task-attachments".
// Quy ước đường dẫn: {workspaceId}/{taskId}/{timestamp}-{tên tệp}
import { supabase } from "@/integrations/supabase/client";

export const TASK_ATTACHMENTS_BUCKET = "task-attachments";
export const MAX_TASK_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB

export { formatBytes } from "./documents-storage";

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").slice(-120);
}

export async function uploadTaskAttachment(opts: {
  workspaceId: string;
  taskId: string;
  file: File;
}): Promise<{ storagePath: string; mimeType: string; sizeBytes: number }> {
  const { workspaceId, taskId, file } = opts;
  if (file.size > MAX_TASK_ATTACHMENT_SIZE) {
    throw new Error("Tệp vượt quá giới hạn 25 MB");
  }
  const storagePath = `${workspaceId}/${taskId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(`Tải tệp lên thất bại: ${error.message}`);
  return { storagePath, mimeType: file.type || "application/octet-stream", sizeBytes: file.size };
}

export async function getTaskAttachmentUrl(storagePath: string, download = false) {
  const { data, error } = await supabase.storage
    .from(TASK_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 300, download ? { download: true } : undefined);
  if (error || !data) throw new Error(`Không tạo được liên kết tải: ${error?.message ?? ""}`);
  return data.signedUrl;
}

export async function removeTaskAttachmentObject(storagePath: string) {
  await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([storagePath]);
}
