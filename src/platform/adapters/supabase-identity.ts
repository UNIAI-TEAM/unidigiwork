// Blueprint §13 — identity adapter. Fail-closed: never returns anonymous
// as authenticated, never fabricates identity.
import { supabase } from "@/integrations/supabase/client";
import type { AuthenticatedIdentity, IdentityResolver, InternalUserId } from "../identity";
import { ApiError } from "@/contracts/errors";

export function createSupabaseIdentityResolver(): IdentityResolver {
  return {
    async resolveCurrent(): Promise<AuthenticatedIdentity | null> {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return {
        subject: data.user.id,
        email: data.user.email ?? undefined,
        displayName: (data.user.user_metadata as { display_name?: string } | null)?.display_name,
        provider: "supabase",
      };
    },
    async resolveInternalUserId(identity: AuthenticatedIdentity): Promise<InternalUserId> {
      // In Phase 0 / Batch 0B the internal users.id equals auth.users.id.
      // The mapping table (external_identities) is authoritative going
      // forward; this adapter must be swapped when auth provider changes.
      if (!identity.subject) {
        throw new ApiError({
          code: "IDENTITY_RESOLUTION_FAILED",
          message: "Cannot resolve internal user id: missing subject.",
        });
      }
      return identity.subject;
    },
  };
}
