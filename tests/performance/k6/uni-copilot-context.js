// k6 — benchmark riêng phần dựng ngữ cảnh (không gọi LLM).
// Chạy: k6 run -e BASE_URL=... -e TOKEN=... tests/performance/k6/uni-copilot-context.js
import http from "k6/http";
import { check } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 100 },
    { duration: "30s", target: 250 },
    { duration: "30s", target: 0 },
  ],
  thresholds: { http_req_duration: ["p(95)<700"], http_req_failed: ["rate<0.01"] },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const TOKEN = __ENV.TOKEN || "";

export default function () {
  const res = http.post(
    `${BASE_URL}/_serverFn/buildAiContext`,
    JSON.stringify({ data: { query: "Dự án này đang vướng gì?" } }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` } },
  );
  check(res, { "status ok": (r) => r.status === 200 || r.status === 401 });
}
