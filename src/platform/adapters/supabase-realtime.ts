// Blueprint §16 — Supabase Realtime adapter. Concrete impl for the
// RealtimeClient port. UI code MUST NOT import supabase.channel directly.
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeClient, RealtimeEvent, RealtimeHandler, Unsubscribe } from "../realtime";

export function createSupabaseRealtimeClient(): RealtimeClient {
  return {
    subscribe<T = unknown>(channel: string, handler: RealtimeHandler<T>): Unsubscribe {
      // Tenant-aware channel naming is the caller's responsibility; we
      // pass the string through verbatim. Never subscribe cross-tenant.
      const ch = supabase.channel(channel).on("broadcast", { event: "*" }, (message) => {
        try {
          const msg = message as unknown as { event?: string; payload?: unknown };
          const evt: RealtimeEvent<T> = {
            channel,
            type: msg.event ?? "message",
            payload: msg.payload as T,
            occurredAt: new Date().toISOString(),
          };
          handler(evt);
        } catch (err) {
          // Never leak vendor errors to the UI.
          console.error("[realtime] handler error", err);
        }
      });
      ch.subscribe();
      return () => {
        try {
          supabase.removeChannel(ch);
        } catch (err) {
          console.error("[realtime] unsubscribe error", err);
        }
      };
    },
  };
}
