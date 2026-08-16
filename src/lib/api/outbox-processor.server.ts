import type { SupabaseClient } from "@supabase/supabase-js";

export type OutboxEvent = {
  id: string;
  tenant_id: string | null;
  event_type: string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  payload: Record<string, unknown> | null;
  correlation_id: string | null;
  occurred_at: string;
  attempt_count: number;
};

type DeliveryLog = {
  event_id: string;
  tenant_id: string | null;
  event_type: string;
  channel: "email" | "push" | "webhook" | "noop";
  target: string | null;
  status: "sent" | "skipped" | "failed";
  http_status?: number | null;
  error?: string | null;
  duration_ms?: number | null;
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** ---------- Channel: push ---------- */
async function deliverPush(ev: OutboxEvent): Promise<DeliveryLog[]> {
  const payload = asRecord(ev.payload);
  const userIds = [
    ...asStringArray(payload["notify_user_ids"]),
    ...asStringArray(payload["recipient_user_ids"]),
  ];
  if (userIds.length === 0) return [];
  const started = Date.now();
  const { sendPushToUsers } = await import("./push-dispatch.server");
  const title = typeof payload["title"] === "string" ? (payload["title"] as string) : "UNIWORK";
  const body = typeof payload["body"] === "string" ? (payload["body"] as string) : ev.event_type;
  const url = typeof payload["href"] === "string" ? (payload["href"] as string) : "/notifications";
  try {
    const res = await sendPushToUsers([...new Set(userIds)], { title, body, url });
    return [
      {
        event_id: ev.id,
        tenant_id: ev.tenant_id,
        event_type: ev.event_type,
        channel: "push",
        target: `${userIds.length} user(s)`,
        status: res.sent > 0 ? "sent" : "skipped",
        duration_ms: Date.now() - started,
        error: res.failed > 0 ? `${res.failed} thiết bị lỗi` : null,
      },
    ];
  } catch (e) {
    return [
      {
        event_id: ev.id,
        tenant_id: ev.tenant_id,
        event_type: ev.event_type,
        channel: "push",
        target: `${userIds.length} user(s)`,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
        duration_ms: Date.now() - started,
      },
    ];
  }
}

/** ---------- Channel: email (Resend) ---------- */
async function deliverEmail(ev: OutboxEvent): Promise<DeliveryLog[]> {
  const payload = asRecord(ev.payload);
  const email = asRecord(payload["email"]);
  const to = asStringArray(email["to"]);
  if (to.length === 0) return [];

  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM_EMAIL"] ?? "UNIWORK <onboarding@resend.dev>";
  const base: Omit<DeliveryLog, "status"> = {
    event_id: ev.id,
    tenant_id: ev.tenant_id,
    event_type: ev.event_type,
    channel: "email",
    target: to.join(", "),
  };
  if (!apiKey) {
    return [{ ...base, status: "skipped", error: "RESEND_API_KEY chưa cấu hình" }];
  }
  const started = Date.now();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: typeof email["subject"] === "string" ? email["subject"] : ev.event_type,
        html:
          typeof email["html"] === "string"
            ? email["html"]
            : `<p>${typeof email["text"] === "string" ? email["text"] : ev.event_type}</p>`,
      }),
    });
    const text = await res.text();
    return [
      {
        ...base,
        status: res.ok ? "sent" : "failed",
        http_status: res.status,
        error: res.ok ? null : text.slice(0, 500),
        duration_ms: Date.now() - started,
      },
    ];
  } catch (e) {
    return [
      {
        ...base,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
        duration_ms: Date.now() - started,
      },
    ];
  }
}

/** ---------- Channel: webhooks ---------- */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function matchesEventType(patterns: string[], eventType: string): boolean {
  if (patterns.length === 0) return true;
  return patterns.some((p) => p === "*" || p === eventType || (p.endsWith("*") && eventType.startsWith(p.slice(0, -1))));
}

async function deliverWebhooks(admin: SupabaseClient, ev: OutboxEvent): Promise<DeliveryLog[]> {
  if (!ev.tenant_id) return [];
  const { data } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret, event_types")
    .eq("tenant_id", ev.tenant_id)
    .eq("enabled", true);
  const endpoints = (data ?? []) as Array<{ id: string; url: string; secret: string; event_types: string[] }>;
  const targets = endpoints.filter((e) => matchesEventType(e.event_types ?? [], ev.event_type));
  if (targets.length === 0) return [];

  const body = JSON.stringify({
    id: ev.id,
    type: ev.event_type,
    tenant_id: ev.tenant_id,
    aggregate: { type: ev.aggregate_type, id: ev.aggregate_id },
    occurred_at: ev.occurred_at,
    correlation_id: ev.correlation_id,
    data: ev.payload ?? {},
  });

  return Promise.all(
    targets.map(async (ep) => {
      const started = Date.now();
      const ts = Math.floor(Date.now() / 1000).toString();
      const base: Omit<DeliveryLog, "status"> = {
        event_id: ev.id,
        tenant_id: ev.tenant_id,
        event_type: ev.event_type,
        channel: "webhook",
        target: ep.url,
      };
      try {
        const signature = await hmacSha256Hex(ep.secret, `${ts}.${body}`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-uniwork-event": ev.event_type,
            "x-uniwork-delivery": ev.id,
            "x-uniwork-timestamp": ts,
            "x-uniwork-signature": `sha256=${signature}`,
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        const errText = res.ok ? null : (await res.text()).slice(0, 500);
        const patch: Record<string, unknown> = {
          last_status: res.status,
          last_error: errText,
          last_delivered_at: new Date().toISOString(),
        };
        if (res.ok) patch["failure_count"] = 0;
        await admin.from("webhook_endpoints").update(patch as never).eq("id", ep.id);
        return {
          ...base,
          status: res.ok ? ("sent" as const) : ("failed" as const),
          http_status: res.status,
          error: errText,
          duration_ms: Date.now() - started,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await admin.from("webhook_endpoints").update({ last_error: message }).eq("id", ep.id);
        return { ...base, status: "failed" as const, error: message, duration_ms: Date.now() - started };
      }
    }),
  );
}

/** Xử lý 1 event: fan-out qua các kênh nền thật. */
export async function handleOutboxEvent(admin: SupabaseClient, ev: OutboxEvent): Promise<DeliveryLog[]> {
  const results = await Promise.all([deliverPush(ev), deliverEmail(ev), deliverWebhooks(admin, ev)]);
  const flat = results.flat();
  if (flat.length === 0) {
    flat.push({
      event_id: ev.id,
      tenant_id: ev.tenant_id,
      event_type: ev.event_type,
      channel: "noop",
      target: null,
      status: "skipped",
      error: "Không có kênh nhận",
    });
  }
  return flat;
}

export type DrainResult = {
  claimed: number;
  processed: number;
  failed: number;
  deliveries: number;
};

/** Claim → xử lý → complete/fail theo lease của outbox_events. */
export async function drainOutbox(
  admin: SupabaseClient,
  opts: { batch?: number; worker?: string; leaseSeconds?: number } = {},
): Promise<DrainResult> {
  const worker = opts.worker ?? `outbox-worker-${crypto.randomUUID().slice(0, 8)}`;
  const batch = Math.min(Math.max(opts.batch ?? 20, 1), 100);
  const { data, error } = await admin.rpc("claim_outbox_events", {
    _worker: worker,
    _batch: batch,
    _lease_seconds: opts.leaseSeconds ?? 120,
  });
  if (error) throw new Error(error.message);
  const events = (data ?? []) as unknown as OutboxEvent[];

  let processed = 0;
  let failed = 0;
  let deliveries = 0;

  for (const ev of events) {
    let logs: DeliveryLog[] = [];
    let fatal: string | null = null;
    try {
      logs = await handleOutboxEvent(admin, ev);
    } catch (e) {
      fatal = e instanceof Error ? e.message : String(e);
    }
    if (logs.length > 0) {
      deliveries += logs.length;
      await admin.from("outbox_deliveries").insert(logs as never);
    }
    const hardFail = fatal ?? (logs.some((l) => l.status === "failed") ? "Có kênh gửi thất bại" : null);
    if (hardFail) {
      failed += 1;
      const backoff = Math.min(60 * 2 ** Math.max(ev.attempt_count - 1, 0), 3600);
      await admin.rpc("fail_outbox_event", {
        _id: ev.id,
        _worker: worker,
        _error: hardFail.slice(0, 1000),
        _retry_after_seconds: backoff,
      });
    } else {
      processed += 1;
      await admin.rpc("complete_outbox_event", { _id: ev.id, _worker: worker });
    }
  }

  return { claimed: events.length, processed, failed, deliveries };
}
