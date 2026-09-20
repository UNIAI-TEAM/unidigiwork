// LIVEKIT_CAPACITY_PLAN.md nghẽn số 1: "500 người vào phòng trong 60s = 500 lệnh
// gọi server function + insert meeting_join_tokens". Kịch bản này đo đúng chỗ đó
// — cửa cấp vé, KHÔNG đo media. Mỗi VU gọi `requestJoinToken` một lần rồi dừng,
// giống hệt hành vi thật: người dùng bấm "Vào phòng" đúng một lần.
//
// Không đo được bằng script này: chất lượng audio/video, băng thông SFU, CPU của
// cụm LiveKit. Những thứ đó cần client thật, nằm ngoài phạm vi k6.
//
// Chạy:
//   k6 run -e BASE_URL=https://staging.example \
//          -e MEETING_ID=<uuid> \
//          -e TOKENS=/duong/dan/jwt-per-line.txt \
//          tests/performance/k6/meeting-join-storm.js
//
// TOKENS là file text, mỗi dòng một access token Supabase của một user test
// khác nhau. Phải khác nhau: rate limit của `issue_meeting_join_token` là
// 10 vé/phút cho mỗi (user, meeting), nên dùng chung một token thì từ VU thứ 11
// trở đi sẽ nhận 'RATE_LIMITED' và phép đo thành vô nghĩa.

import http from "k6/http";
import { check } from "k6";
import encoding from "k6/encoding";
import { Counter, Rate, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const BASE_URL = __ENV.BASE_URL;
const MEETING_ID = __ENV.MEETING_ID;
const TOKENS_FILE = __ENV.TOKENS;
const TARGET_VUS = Number(__ENV.VUS || 500);
const RAMP_SECONDS = Number(__ENV.RAMP || 60);

if (!BASE_URL || !MEETING_ID || !TOKENS_FILE) {
  throw new Error("Cần BASE_URL, MEETING_ID và TOKENS. Xem phần chú thích đầu file.");
}

const tokens = new SharedArray("auth tokens", () =>
  open(TOKENS_FILE)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean),
);

const issued = new Counter("join_token_issued");
const rateLimited = new Counter("join_token_rate_limited");
const quotaDenied = new Counter("join_token_quota_denied");
const issueFailed = new Rate("join_token_failed");
const issueDuration = new Trend("join_token_duration", true);

export const options = {
  scenarios: {
    // Đúng hình dạng của một cuộc họp toàn công ty: tất cả đổ vào trong 1 phút.
    join_storm: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: `${RAMP_SECONDS}s`, target: TARGET_VUS },
        { duration: "30s", target: TARGET_VUS },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    // Người dùng bấm "Vào phòng" rồi nhìn màn hình chờ: quá 2s là cảm thấy hỏng.
    join_token_duration: ["p(95)<2000", "p(99)<5000"],
    join_token_failed: ["rate<0.01"],
    // Rate limit bắn vào người dùng thật nghĩa là ngưỡng đặt sai, không phải
    // hệ thống được bảo vệ tốt.
    join_token_rate_limited: ["count<1"],
  },
};

// Định danh server function của TanStack Start, cùng quy ước với
// tests/runtime/*/probe.mjs — đổi cách đặt tên ở đó thì đổi cả ở đây.
const FN_ID = encoding.b64encode(
  JSON.stringify({
    file: "/src/lib/api/meetings.functions.ts?tss-serverfn-split",
    export: "requestJoinToken_createServerFn_handler",
  }),
  "rawurl",
);

export default function () {
  if (tokens.length === 0) return;
  // Mỗi VU bám một token riêng để không đụng rate limit theo (user, meeting).
  const token = tokens[(__VU - 1) % tokens.length];

  const res = http.post(
    `${BASE_URL}/_serverFn/${FN_ID}`,
    JSON.stringify({ data: { meetingId: MEETING_ID } }),
    {
      headers: {
        "Content-Type": "application/json",
        "x-tss-serialized": "true",
        Authorization: `Bearer ${token}`,
      },
      tags: { name: "requestJoinToken" },
    },
  );

  issueDuration.add(res.timings.duration);

  const body = res.status === 200 ? res.json() : null;
  const ok = res.status === 200 && body && typeof body.token === "string" && body.token.length > 0;

  const errText = res.status === 200 ? "" : String(res.body || "");
  if (errText.includes("RATE_LIMITED")) rateLimited.add(1);
  if (errText.includes("QUOTA_EXCEEDED") || errText.includes("ENTITLEMENT_DENIED"))
    quotaDenied.add(1);
  if (ok) issued.add(1);
  issueFailed.add(!ok);

  check(res, {
    "cấp được vé vào phòng": () => Boolean(ok),
    // Vé phải ngắn hạn — TTL dài là lỗ hổng, không phải tối ưu.
    "vé hết hạn trong vòng 15 phút": () =>
      !ok || new Date(body.expiresAt).getTime() - Date.now() <= 15 * 60_000 + 5_000,
    // Chính là lỗi đã sửa: thiếu claim tên thì LiveKit hiện UUID cho cả phòng.
    "vé có tên hiển thị": () =>
      !ok || (typeof body.displayName === "string" && body.displayName.length > 0),
  });
}

export function handleSummary(data) {
  return {
    "tests/performance/artifacts/meeting-join-storm.json": JSON.stringify(data, null, 2),
    stdout:
      `\nJoin storm: ${TARGET_VUS} VU trong ${RAMP_SECONDS}s\n` +
      `  vé cấp thành công : ${data.metrics.join_token_issued?.values.count ?? 0}\n` +
      `  bị rate limit     : ${data.metrics.join_token_rate_limited?.values.count ?? 0}\n` +
      `  bị chặn quota     : ${data.metrics.join_token_quota_denied?.values.count ?? 0}\n` +
      `  p95 / p99         : ${Math.round(data.metrics.join_token_duration?.values["p(95)"] ?? 0)}ms / ` +
      `${Math.round(data.metrics.join_token_duration?.values["p(99)"] ?? 0)}ms\n`,
  };
}
