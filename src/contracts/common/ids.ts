// Blueprint §13 — neutral identifier types used across contracts.
// Branded types to prevent accidental cross-type assignment while
// staying serializable across the wire.
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type TenantId = Brand<string, "TenantId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type UserId = Brand<string, "UserId">;
export type TaskId = Brand<string, "TaskId">;
export type MeetingId = Brand<string, "MeetingId">;
export type DocumentId = Brand<string, "DocumentId">;
export type NotificationId = Brand<string, "NotificationId">;
export type CorrelationId = Brand<string, "CorrelationId">;
export type IdempotencyKey = Brand<string, "IdempotencyKey">;

export const asTenantId = (s: string): TenantId => s as TenantId;
export const asWorkspaceId = (s: string): WorkspaceId => s as WorkspaceId;
export const asUserId = (s: string): UserId => s as UserId;
export const asTaskId = (s: string): TaskId => s as TaskId;
export const asMeetingId = (s: string): MeetingId => s as MeetingId;
export const asDocumentId = (s: string): DocumentId => s as DocumentId;
export const asNotificationId = (s: string): NotificationId => s as NotificationId;
export const asCorrelationId = (s: string): CorrelationId => s as CorrelationId;
export const asIdempotencyKey = (s: string): IdempotencyKey => s as IdempotencyKey;
