// LiveKit server helpers (ADR-1E-001). Server-only: never imported by client code.
// HS256 signing/verification via Web Crypto so it runs on the Worker runtime.

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function readLiveKitConfig(): LiveKitConfig | null {
  const url = process.env["LIVEKIT_URL"];
  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Uint8Array {
  const pad = input.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export type LiveKitRole = "host" | "moderator" | "participant" | "viewer";

function grantsFor(role: LiveKitRole, room: string) {
  const admin = role === "host" || role === "moderator";
  const publisher = role !== "viewer";
  return {
    room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: publisher,
    canPublishData: publisher,
    ...(admin ? { roomAdmin: true } : {}),
  };
}

export async function signJoinToken(input: {
  config: LiveKitConfig;
  identity: string;
  name?: string;
  room: string;
  role: LiveKitRole;
  ttlSeconds: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.min(Math.max(input.ttlSeconds, 60), 900); // TTL <= 15 min
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: input.config.apiKey,
    sub: input.identity,
    jti: input.identity,
    nbf: now - 5,
    iat: now,
    exp,
    ...(input.name ? { name: input.name } : {}),
    video: grantsFor(input.role, input.room),
  };
  const signingInput = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(input.config.apiSecret), enc.encode(signingInput)),
  );
  return { token: `${signingInput}.${b64url(sig)}`, expiresAt: new Date(exp * 1000) };
}

/** sha256 prefix used as audit fingerprint — never store the token itself. */
export async function fingerprint(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(token)));
  return Array.from(digest.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface LiveKitWebhookClaims {
  iss: string;
  exp?: number;
  sha256?: string;
}

/**
 * Verify a LiveKit webhook: JWT in `Authorization` header signed with the
 * webhook api-secret, whose `sha256` claim must match the raw body digest.
 */
export async function verifyWebhook(
  authorization: string | null,
  rawBody: string,
  secret: string,
  maxSkewSeconds = 300,
): Promise<boolean> {
  if (!authorization) return false;
  const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
  const parts = jwt.split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts as [string, string, string];
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      b64urlDecode(s) as unknown as ArrayBuffer,
      enc.encode(`${h}.${p}`),
    );
  } catch {
    return false; // chữ ký/base64 hỏng ⇒ coi như không hợp lệ, không ném lỗi 500
  }
  if (!valid) return false;

  let claims: LiveKitWebhookClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p))) as LiveKitWebhookClaims;
  } catch {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp + maxSkewSeconds < now) return false;

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(rawBody)));
  const expected = btoa(String.fromCharCode(...digest));
  const got = claims.sha256 ?? "";
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/** meeting id encoded in the LiveKit room name (`mtg_<uuid>`). */
export function meetingIdFromRoom(roomName: string | undefined): string | null {
  if (!roomName || !roomName.startsWith("mtg_")) return null;
  const id = roomName.slice(4);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Ký JWT quản trị ngắn hạn cho RoomService (grant `roomList`). */
async function signAdminToken(config: LiveKitConfig, ttlSeconds = 60): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: config.apiKey,
    sub: "uniwork-reconciler",
    nbf: now - 5,
    iat: now,
    exp: now + ttlSeconds,
    video: { roomList: true, roomAdmin: true },
  };
  const signingInput = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(config.apiSecret), enc.encode(signingInput)),
  );
  return `${signingInput}.${b64url(sig)}`;
}

function httpBase(url: string): string {
  return url.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://").replace(/\/+$/, "");
}

export interface LiveKitRoom {
  sid?: string;
  name?: string;
  numParticipants?: number;
  creationTime?: number | string;
}

/** Gọi RoomService.ListRooms để đối soát phòng đang tồn tại trên cụm. */
export async function listRooms(config: LiveKitConfig): Promise<LiveKitRoom[]> {
  const token = await signAdminToken(config);
  const res = await fetch(`${httpBase(config.url)}/twirp/livekit.RoomService/ListRooms`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(`LiveKit ListRooms failed [${res.status}]: ${await res.text()}`);
  }
  const data = (await res.json()) as { rooms?: LiveKitRoom[] };
  return data.rooms ?? [];
}