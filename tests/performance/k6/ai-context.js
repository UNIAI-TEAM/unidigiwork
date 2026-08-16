// Benchmark riêng cho CONTEXT BUILD (không gọi LLM) — tránh đốt chi phí provider.
// Chạy: k6 run -e BASE_URL=... -e TOKEN=... tests/performance/k6/ai-context.js
import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";

const contextBuild = new Trend("ai_context_build_ms", true);

export const options = {
  scenarios: {
    tier_50: { executor: "constant-vus", vus: 50, duration: "1m", startTime: "0s" },
    tier_100: { executor: "constant-vus", vus: 100, duration: "1m", startTime: "1m" },
    tier_250: { executor: "constant-vus", vus: 250, duration: "1m", startTime: "2m" },
  },
  thresholds: {
    ai_context_build_ms: ["p(50)<300", "p(95)<700", "p(99)<1500"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const TOKEN = __ENV.TOKEN || "";
// Nhiều tenant/nhiều root để không dồn tải vào một tenant (§162).
const CASES = JSON.parse(__ENV.CASES || '[{"query":"Dự án này đang vướng gì?"}]');

export default function () {
  const body = JSON.stringify({ data: CASES[__VU % CASES.length] });
  const res = http.post(`${BASE_URL}/_serverFn/buildAiContext`, body, {
    headers: { "Content-Type": "application/json", Authorization: TOKEN ? `Bearer ${TOKEN}` : "" },
  });
  contextBuild.add(res.timings.duration);
  check(res, { "status ok": (r) => r.status === 200 });
}