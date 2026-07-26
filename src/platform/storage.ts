/**
 * Object storage abstraction (Blueprint §15).
 *
 * Database chỉ lưu (storage_provider, bucket, object_key, checksum, size_bytes,
 * mime_type, tenant_id, created_by, classification, retention_until).
 * KHÔNG lưu public URL cố định.
 */

export type StorageProviderKind = "supabase" | "minio" | "s3";

export interface UploadRequest {
  readonly tenantId: string;
  readonly bucket: string;
  readonly objectKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly classification?: "public" | "internal" | "confidential" | "restricted";
}

export interface DownloadRequest {
  readonly tenantId: string;
  readonly bucket: string;
  readonly objectKey: string;
  /** Seconds. Adapter quyết định giới hạn thực tế. */
  readonly expiresIn?: number;
}

export interface DeleteRequest {
  readonly tenantId: string;
  readonly bucket: string;
  readonly objectKey: string;
}

export interface UploadUrl {
  readonly url: string;
  readonly method: "PUT" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
  readonly expiresAt: string;
}

export interface DownloadUrl {
  readonly url: string;
  readonly expiresAt: string;
}

export interface ObjectStorage {
  readonly provider: StorageProviderKind;
  createUploadUrl(input: UploadRequest): Promise<UploadUrl>;
  createDownloadUrl(input: DownloadRequest): Promise<DownloadUrl>;
  deleteObject(input: DeleteRequest): Promise<void>;
}
