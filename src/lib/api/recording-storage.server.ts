// Kho lưu bản ghi cuộc họp (S3-compatible). Server-only: không import từ client.
// Dùng cho LiveKit Egress upload trực tiếp + tạo link tải có chữ ký (SigV4).

export interface RecordingStorageConfig {
  endpoint: string; // https://... (không kèm bucket)
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export function readRecordingStorageConfig(): RecordingStorageConfig | null {
  const endpoint = process.env["RECORDING_S3_ENDPOINT"];
  const bucket = process.env["RECORDING_S3_BUCKET"];
  const accessKeyId = process.env["RECORDING_S3_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["RECORDING_S3_SECRET_ACCESS_KEY"];
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    region: process.env["RECORDING_S3_REGION"] ?? "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: (process.env["RECORDING_S3_FORCE_PATH_STYLE"] ?? "true") !== "false",
  };
}

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(input)));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
}

function uriEncode(value: string, encodeSlash = true): string {
  return value
    .split("")
    .map((c) => {
      if (/[A-Za-z0-9\-._~]/.test(c)) return c;
      if (c === "/") return encodeSlash ? "%2F" : "/";
      return "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    })
    .join("");
}

/** `s3://bucket/key` → key (hoặc null nếu không phải URL nội bộ). */
export function parseS3Url(url: string | null | undefined): { bucket: string; key: string } | null {
  if (!url || !url.startsWith("s3://")) return null;
  const rest = url.slice(5);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
}

export function recordingObjectKey(meetingId: string, recordingId: string): string {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `meetings/${stamp}/${meetingId}/${recordingId}.mp4`;
}

/** Presigned GET URL (SigV4), mặc định hết hạn sau 10 phút. */
export async function presignGetUrl(
  config: RecordingStorageConfig,
  key: string,
  expiresInSeconds = 600,
): Promise<string> {
  const base = new URL(config.endpoint);
  const host = config.forcePathStyle ? base.host : `${config.bucket}.${base.host}`;
  const path = config.forcePathStyle
    ? `${base.pathname.replace(/\/+$/, "")}/${config.bucket}/${key}`
    : `${base.pathname.replace(/\/+$/, "")}/${key}`;
  const canonicalUri = "/" + uriEncode(path.replace(/^\/+/, ""), false);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;

  const params: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(Math.min(Math.max(expiresInSeconds, 60), 604800))],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = params
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  let signingKey = await hmac(enc.encode(`AWS4${config.secretAccessKey}`), dateStamp);
  signingKey = await hmac(signingKey, config.region);
  signingKey = await hmac(signingKey, "s3");
  signingKey = await hmac(signingKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));

  return `${base.protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}