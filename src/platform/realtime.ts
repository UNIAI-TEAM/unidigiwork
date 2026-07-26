/**
 * Realtime abstraction (Blueprint §16).
 *
 * Component KHÔNG được phụ thuộc trực tiếp cú pháp channel của Supabase.
 * Adapter cụ thể (Supabase Realtime, Spring WebSocket/SSE, Redis Pub/Sub,
 * Kafka) sẽ implement interface dưới đây.
 */

export type RealtimeEvent<T = unknown> = {
  readonly channel: string;
  readonly type: string;
  readonly payload: T;
  readonly occurredAt: string;
};

export type RealtimeHandler<T = unknown> = (event: RealtimeEvent<T>) => void;

export type Unsubscribe = () => void;

export interface RealtimeClient {
  subscribe<T = unknown>(channel: string, handler: RealtimeHandler<T>): Unsubscribe;
}
