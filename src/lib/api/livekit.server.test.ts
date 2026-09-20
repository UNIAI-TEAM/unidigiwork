// Tầng ký token/verify webhook của LiveKit trước đây không có test nào, trong khi
// đây là ranh giới tin cậy: sai một claim là lộ quyền, sai verify là nhận webhook giả.
import { describe, expect, it } from "vitest";
import {
  fingerprint,
  meetingIdFromRoom,
  signJoinToken,
  verifyWebhook,
  type LiveKitConfig,
} from "./livekit.server";

const config: LiveKitConfig = {
  url: "wss://lk.example.test",
  apiKey: "APIkey123",
  apiSecret: "secret-dai-hon-32-ky-tu-de-hmac-that",
};

const enc = new TextEncoder();

function decodeClaims(token: string): Record<string, unknown> {
  const payload = token.split(".")[1] as string;
  const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  // `atob` trả từng byte một; tên tiếng Việt là UTF-8 nhiều byte nên phải giải
  // mã lại, nếu không sẽ đọc nhầm thành mojibake và tưởng production sai.
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

describe("signJoinToken", () => {
  const base = {
    config,
    identity: "11111111-1111-4111-8111-111111111111",
    room: "mtg_22222222-2222-4222-8222-222222222222",
    role: "participant" as const,
    ttlSeconds: 900,
  };

  it("đặt claim `name` khi có tên hiển thị", async () => {
    const { token } = await signJoinToken({ ...base, name: "Nguyễn Văn A" });
    expect(decodeClaims(token)["name"]).toBe("Nguyễn Văn A");
  });

  it("bỏ khoảng trắng thừa quanh tên", async () => {
    const { token } = await signJoinToken({ ...base, name: "  Trần Thị B  " });
    expect(decodeClaims(token)["name"]).toBe("Trần Thị B");
  });

  // Tên rỗng mà vẫn đặt claim thì LiveKit hiển thị chuỗi rỗng; không đặt claim
  // thì prefab rơi về `identity`. Cả hai đều xấu, nên caller phải luôn gửi tên
  // thật — ở đây chỉ chốt rằng claim rác không lọt xuống.
  it("không đặt claim `name` khi tên rỗng hoặc chỉ có khoảng trắng", async () => {
    for (const name of ["", "   ", undefined]) {
      const { token } = await signJoinToken({ ...base, name });
      expect(decodeClaims(token)).not.toHaveProperty("name");
    }
  });

  it("viewer không được publish, participant thì được", async () => {
    const viewer = decodeClaims((await signJoinToken({ ...base, role: "viewer" })).token);
    const member = decodeClaims((await signJoinToken({ ...base, role: "participant" })).token);
    expect((viewer["video"] as Record<string, unknown>)["canPublish"]).toBe(false);
    expect((member["video"] as Record<string, unknown>)["canPublish"]).toBe(true);
  });

  it("chỉ host/moderator có roomAdmin", async () => {
    const host = decodeClaims((await signJoinToken({ ...base, role: "host" })).token);
    const member = decodeClaims((await signJoinToken({ ...base, role: "participant" })).token);
    expect((host["video"] as Record<string, unknown>)["roomAdmin"]).toBe(true);
    expect(member["video"]).not.toHaveProperty("roomAdmin");
  });

  it("grant bị khoá vào đúng một phòng", async () => {
    const claims = decodeClaims((await signJoinToken(base)).token);
    expect((claims["video"] as Record<string, unknown>)["room"]).toBe(base.room);
  });

  it("kẹp TTL trong khoảng 60s..900s", async () => {
    const short = decodeClaims((await signJoinToken({ ...base, ttlSeconds: 1 })).token);
    const long = decodeClaims((await signJoinToken({ ...base, ttlSeconds: 99_999 })).token);
    expect(Number(short["exp"]) - Number(short["iat"])).toBe(60);
    expect(Number(long["exp"]) - Number(long["iat"])).toBe(900);
  });
});

describe("verifyWebhook", () => {
  const secret = "webhook-secret-cua-livekit";

  /** Dựng đúng loại JWT mà LiveKit gắn vào header `Authorization`. */
  async function signWebhookJwt(body: string, over: Record<string, unknown> = {}) {
    const b64url = (bytes: Uint8Array) => {
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(body)));
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: config.apiKey,
      exp: now + 300,
      sha256: btoa(String.fromCharCode(...digest)),
      ...over,
    };
    const input = `${b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })))}.${b64url(
      enc.encode(JSON.stringify(claims)),
    )}`;
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(input)));
    return `${input}.${b64url(sig)}`;
  }

  const body = JSON.stringify({ event: "room_started", room: { name: "mtg_x" } });

  it("chấp nhận webhook hợp lệ", async () => {
    const jwt = await signWebhookJwt(body);
    expect(await verifyWebhook(`Bearer ${jwt}`, body, secret)).toBe(true);
  });

  it("từ chối khi body bị sửa sau khi ký", async () => {
    const jwt = await signWebhookJwt(body);
    expect(await verifyWebhook(`Bearer ${jwt}`, `${body} `, secret)).toBe(false);
  });

  it("từ chối khi ký bằng secret khác", async () => {
    const jwt = await signWebhookJwt(body);
    expect(await verifyWebhook(`Bearer ${jwt}`, body, "secret-khac")).toBe(false);
  });

  it("từ chối khi JWT đã hết hạn quá mức lệch giờ cho phép", async () => {
    const jwt = await signWebhookJwt(body, { exp: Math.floor(Date.now() / 1000) - 3600 });
    expect(await verifyWebhook(`Bearer ${jwt}`, body, secret)).toBe(false);
  });

  it("từ chối header thiếu, sai định dạng hoặc base64 hỏng mà không ném lỗi", async () => {
    expect(await verifyWebhook(null, body, secret)).toBe(false);
    expect(await verifyWebhook("Bearer khong-phai-jwt", body, secret)).toBe(false);
    expect(await verifyWebhook("Bearer a.b.!!!", body, secret)).toBe(false);
  });
});

describe("meetingIdFromRoom", () => {
  it("lấy được id từ tên phòng đúng định dạng", () => {
    expect(meetingIdFromRoom("mtg_22222222-2222-4222-8222-222222222222")).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
  });

  it("bỏ qua phòng của ứng dụng khác trên cùng cụm", () => {
    expect(meetingIdFromRoom("other_app_room")).toBeNull();
    expect(meetingIdFromRoom("mtg_khong-phai-uuid")).toBeNull();
    expect(meetingIdFromRoom(undefined)).toBeNull();
  });
});

describe("fingerprint", () => {
  it("ổn định và không chứa token gốc", async () => {
    const fp = await fingerprint("token-bi-mat");
    expect(fp).toBe(await fingerprint("token-bi-mat"));
    expect(fp).toHaveLength(32);
    expect(fp).not.toContain("token-bi-mat");
  });
});
