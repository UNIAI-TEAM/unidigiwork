// Blueprint §15 — storage adapter skeleton. DB stores object refs, never
// permanent public URLs. Caller must supply tenantId; adapter validates
// the tenant namespace prefix.
import { supabase } from "@/integrations/supabase/client";
import { ApiError } from "@/contracts/errors";
import type {
  DeleteRequest,
  DownloadRequest,
  DownloadUrl,
  ObjectStorage,
  UploadRequest,
  UploadUrl,
} from "../storage";

function assertTenantNamespace(tenantId: string, objectKey: string) {
  if (!tenantId) {
    throw new ApiError({
      code: "TENANT_CONTEXT_REQUIRED",
      message: "Storage operation requires tenantId.",
    });
  }
  // Object keys MUST live under `tenants/<tenantId>/...` to guarantee
  // tenant isolation at the storage layer.
  const prefix = `tenants/${tenantId}/`;
  if (!objectKey.startsWith(prefix)) {
    throw new ApiError({
      code: "VALIDATION_FAILED",
      message: `Object key must start with '${prefix}'.`,
    });
  }
}

export function createSupabaseStorage(): ObjectStorage {
  return {
    provider: "supabase",
    async createUploadUrl(input: UploadRequest): Promise<UploadUrl> {
      assertTenantNamespace(input.tenantId, input.objectKey);
      const { data, error } = await supabase.storage
        .from(input.bucket)
        .createSignedUploadUrl(input.objectKey);
      if (error || !data) {
        throw new ApiError({
          code: "BACKEND_UNAVAILABLE",
          message: "Failed to create upload URL.",
        });
      }
      return {
        url: data.signedUrl,
        method: "PUT",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
    },
    async createDownloadUrl(input: DownloadRequest): Promise<DownloadUrl> {
      assertTenantNamespace(input.tenantId, input.objectKey);
      const ttl = input.expiresIn ?? 60;
      const { data, error } = await supabase.storage
        .from(input.bucket)
        .createSignedUrl(input.objectKey, ttl);
      if (error || !data) {
        throw new ApiError({
          code: "BACKEND_UNAVAILABLE",
          message: "Failed to create download URL.",
        });
      }
      return {
        url: data.signedUrl,
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      };
    },
    async deleteObject(input: DeleteRequest): Promise<void> {
      assertTenantNamespace(input.tenantId, input.objectKey);
      const { error } = await supabase.storage.from(input.bucket).remove([input.objectKey]);
      if (error) {
        throw new ApiError({
          code: "BACKEND_UNAVAILABLE",
          message: "Failed to delete object.",
        });
      }
    },
  };
}