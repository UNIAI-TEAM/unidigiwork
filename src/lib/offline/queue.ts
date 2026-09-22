/**
 * Hàng đợi thao tác ngoại tuyến: khi mất mạng, thao tác được lưu lại và tự gửi khi có mạng.
 * Chỉ dùng cho các thao tác an toàn khi gửi lại (có idempotency key).
 */
import { commentWorkDeliverable, resolveWorkDeliverableComment } from "@/lib/api/work-deliverables.functions";
import { reassignTaskOwner } from "@/lib/api/task-ops.functions";
import { pushQueue, readQueue, removeQueued, updateQueued, type QueuedMutation } from "./db";

export type OfflineKind = "wp.comment" | "wp.comment.resolve" | "task.reassign";

const handlers: Record<OfflineKind, (payload: any) => Promise<unknown>> = {
  "wp.comment": (p) => commentWorkDeliverable({ data: p }),
  "wp.comment.resolve": (p) => resolveWorkDeliverableComment({ data: p }),
  "task.reassign": (p) => reassignTaskOwner({ data: p }),
};

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();
let pendingCount = 0;

function emit(n: number) {
  pendingCount = n;
  for (const l of listeners) l(n);
}

export function subscribeOfflineQueue(listener: Listener) {
  listeners.add(listener);
  listener(pendingCount);
  void refreshCount();
  return () => listeners.delete(listener);
}

export async function refreshCount() {
  const items = await readQueue();
  emit(items.length);
  return items.length;
}

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Xếp hàng một thao tác để gửi lại khi có mạng. */
export async function enqueueOffline(kind: OfflineKind, payload: unknown) {
  const item: QueuedMutation = {
    id: crypto.randomUUID(),
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };
  await pushQueue(item);
  await refreshCount();
}

/**
 * Chạy thao tác ngay nếu có mạng; nếu ngoại tuyến hoặc gọi lỗi mạng thì xếp hàng.
 * Trả về true khi đã gửi thật, false khi được xếp hàng.
 */
export async function runOrQueue(kind: OfflineKind, payload: unknown): Promise<boolean> {
  if (isOffline()) {
    await enqueueOffline(kind, payload);
    return false;
  }
  try {
    await handlers[kind](payload);
    return true;
  } catch (err) {
    if (isOffline()) {
      await enqueueOffline(kind, payload);
      return false;
    }
    throw err;
  }
}

let flushing = false;

/** Gửi lại toàn bộ hàng đợi. Bỏ qua khi đang ngoại tuyến. */
export async function flushOfflineQueue(): Promise<{ sent: number; failed: number }> {
  if (flushing || isOffline()) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    for (const item of await readQueue()) {
      const handler = handlers[item.kind as OfflineKind];
      if (!handler) {
        await removeQueued(item.id);
        continue;
      }
      try {
        await handler(item.payload);
        await removeQueued(item.id);
        sent += 1;
      } catch (err) {
        failed += 1;
        const attempts = item.attempts + 1;
        if (attempts >= 5) await removeQueued(item.id);
        else
          await updateQueued({
            ...item,
            attempts,
            lastError: err instanceof Error ? err.message : String(err),
          });
        if (isOffline()) break;
      }
    }
  } finally {
    flushing = false;
    await refreshCount();
  }
  return { sent, failed };
}
