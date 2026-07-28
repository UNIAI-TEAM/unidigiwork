import { z } from "zod";
import type { NotificationId, TenantId, UserId } from "../common/ids";
import type { CommandMetadata } from "../common/base";
import { commandMetadataSchema } from "../common/base";

export type NotificationScope = "platform" | "identity" | "tenant";

export interface NotificationDto {
  id: NotificationId;
  scope: NotificationScope;
  tenantId?: TenantId | null;
  recipientId: UserId;
  kind: string;
  title: string;
  body?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationPreferenceDto {
  userId: UserId;
  kind: string;
  channelEmail: boolean;
  channelInApp: boolean;
}

export interface MarkNotificationReadCommand extends CommandMetadata {
  notificationId: NotificationId;
}

export const MarkNotificationReadCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  notificationId: z.string().uuid(),
});
