/**
 * Platform identity abstraction (Blueprint §13).
 *
 * Frontend/business code KHÔNG import trực tiếp `@supabase/supabase-js` User
 * hoặc Keycloak token payload. Mọi caller chỉ dùng `AuthenticatedIdentity`.
 *
 * Adapter Supabase/Keycloak sẽ được thêm ở Batch 0C và cutover ở giai đoạn
 * on-premise. Trong Batch 0A đây chỉ là contract.
 */

export type IdentityProviderKind = "lovable" | "supabase" | "keycloak";

export interface AuthenticatedIdentity {
  /** Stable external subject (auth.users.id / Keycloak sub). */
  readonly subject: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly provider: IdentityProviderKind;
}

/**
 * Internal stable user id (Blueprint §13.3). Không dùng
 * `AuthenticatedIdentity.subject` làm khóa nghiệp vụ ở mọi bảng.
 */
export type InternalUserId = string;

export interface IdentityResolver {
  resolveCurrent(): Promise<AuthenticatedIdentity | null>;
  resolveInternalUserId(identity: AuthenticatedIdentity): Promise<InternalUserId>;
}
