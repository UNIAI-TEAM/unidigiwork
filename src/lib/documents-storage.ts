// Lưu trữ tệp tài liệu trên bucket riêng "documents".
// Quy ước đường dẫn: {workspaceId}/{documentKey}/{timestamp}-{tên tệp}
// Policy storage.objects kiểm tra segment đầu tiên = workspace_id của thành viên.
import { supabase } from "@/integrations/supabase/client";

export const DOCUMENTS_BUCKET = "documents";
export const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB

export type StorageRef = {
  provider: string;
  bucket: string;
  objectKey: string;
};

export function isStorageRef(v: unknown): v is StorageRef {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r["bucket"] === "string" && typeof r["objectKey"] === "string";
}

export function formatBytes(n: number | null | undefined) {
  if (!n || n <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function safeName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);
}

export async function uploadDocumentFile(opts: {
  workspaceId: string;
  file: File;
  documentKey?: string;
}): Promise<{ storageRef: StorageRef; mimeType: string; sizeBytes: number }> {
  const { workspaceId, file } = opts;
  if (file.size > MAX_DOCUMENT_SIZE) {
    throw new Error(`Tệp vượt quá giới hạn ${formatBytes(MAX_DOCUMENT_SIZE)}`);
  }
  const key = opts.documentKey ?? crypto.randomUUID();
  const objectKey = `${workspaceId}/${key}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(objectKey, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(`Tải tệp lên thất bại: ${error.message}`);
  return {
    storageRef: { provider: "supabase", bucket: DOCUMENTS_BUCKET, objectKey },
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  };
}

export async function getDocumentFileUrl(
  ref: unknown,
  opts?: { download?: boolean | string },
): Promise<string> {
  if (!isStorageRef(ref)) throw new Error("Tài liệu chưa có tệp đính kèm");
  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.objectKey, 300, opts?.download ? { download: opts.download } : undefined);
  if (error || !data) throw new Error(`Không tạo được liên kết tải: ${error?.message ?? ""}`);
  return data.signedUrl;
}

export function fileNameOf(ref: unknown): string | null {
  if (!isStorageRef(ref)) return null;
  const last = ref.objectKey.split("/").pop() ?? "";
  return last.replace(/^\d+-/, "") || null;
}
