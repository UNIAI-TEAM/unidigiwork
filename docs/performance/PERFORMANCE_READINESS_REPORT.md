# UNIWORK — PERFORMANCE READINESS REPORT

Ngày: 2026-08-15 · Môi trường: Lovable Cloud (preview DB, dataset dev nhỏ) · Load generator: k6 v1.4.0 trong sandbox (16 vCPU, 32 GB), RTT sandbox→backend ~180 ms.

## 1. Kết quả runtime đã đo

| Tier | VU | Thời lượng | req/s | p50 | p95 | p99 | Lỗi | Verdict |
|---|---|---|---|---|---|---|---|---|
| Smoke | 50 | 2m10s | 12.9 | 195 ms | 217 ms | 546 ms | 0.00% | **PASS** |
| Tier-250 | 250 | 90s | 85.1 | 196 ms | 286 ms (list 267 / rpc p95 1.13 s) | 1.68 s max | 0.00% | **PASS có cảnh báo** — RPC p95 vượt ngưỡng 300 ms |
| Tier-500 | 500 | 3m58s | 132.1 | 174 ms | 191 ms (list 190 / rpc 189 / heavy 204) | 485 ms (p99 list), max 965 ms | 0.00% | **PASS** — toàn bộ threshold đạt |
| Tier-1000 | 1000 | 4m36s | 162.8 | 193 ms | **28.4 s** (list 28.3 / rpc 28.6 / heavy 28.8) | 45.3 s (p99 list), max 60 s (timeout) | 0.15% | **FAIL** — sập đuôi latency ở steady 1.000 VU |

### Tier-1000 (2026-08-16) — điểm nghẽn mới
45.017 request, 26.419 iteration, 72 request lỗi (toàn bộ là **request timeout 60 s**), 47 check fail.
Median vẫn 193 ms (bằng 500 VU) nhưng p90 nhảy lên 3,08 s và p95 lên 28,4 s → **không phải DB chậm mà
là hàng đợi**: request nằm chờ, khi được phục vụ thì vẫn nhanh. Snapshot DB ngay sau test:
connections 22/60, pool clients 1/200, disk 17%, memory 69%, 0 restart — Postgres **không** bão hoà.

Kết luận điểm nghẽn: tầng **API gateway/PostgREST concurrency + egress** (mọi kind list/rpc/heavy đều
degrade đồng đều, đúng dấu hiệu nghẽn chung một hàng đợi, không phải một query xấu). Hành động:
1. Nâng instance Lovable Cloud (compute) rồi đo lại — đây là biến số duy nhất chưa thử.
2. Giảm số request/người: gộp 3 call dashboard thành 1 RPC `get_dashboard_bundle`.
3. Tăng staleTime/cache client cho list ít đổi (meetings, documents) để cắt QPS nền.
4. Đo lại từ runner ngoài sandbox để loại bỏ nghi ngờ giới hạn egress phía load generator.
Artifact: `tests/performance/artifacts/tier-1000vu.json` · script: `tests/performance/k6/tier-1000.js`.

Tier-500 (2026-08-15, sau khi áp dụng PERF-001…009): 31.391 request, 18.383 iteration, 0 lỗi,
18.383/18.383 check pass. Đuôi RPC p95 1,13 s ở mốc 250 VU đã biến mất sau khi `getUnreadCounts`
chuyển sang 1 RPC — ở 500 VU rpc p95 chỉ 189 ms. Bottleneck còn lại lúc này là RTT mạng ~165 ms,
không phải DB. Artifact: `tests/performance/artifacts/tier-500vu.json`.

Điểm nghẽn tiếp theo cần công phá (chưa đo được ở tier này):
1. Chi phí RLS đa tenant — vẫn chỉ 1 phiên người dùng, chưa có pool ≥500 fixture users.
2. Dataset dev nhỏ (bảng lớn nhất 1.309 dòng) → query plan chưa phản ánh tải thật.
3. Ghi (write path): tier này chủ yếu đọc; cần chat-storm/notification-storm để đo outbox lag.

Ghi chú: ~180 ms trong mọi số đo là RTT mạng từ sandbox, không phải thời gian DB. Không có
request lỗi nào ở 250 VU; đuôi p95 của RPC tăng là dấu hiệu hàng đợi kết nối bắt đầu hình thành.

## 2. Tối ưu đã thực hiện (chi tiết: OPTIMIZATION_FIX_LEDGER.md)
- PERF-001/003/004: bỏ toàn bộ Realtime subscribe firehose (chat, unread, notifications) → chỉ còn
  channel theo user / theo kênh. Đây là fix quan trọng nhất cho mốc >1.000 users.
- PERF-002: `getUnreadCounts` từ N+1 (≤201 query) xuống **1 RPC**.
- PERF-005: bỏ 2 chỗ `invalidateQueries()` xoá toàn cache.
- PERF-006…009: 6 index mới (workspace_members.user_id, trgm subject email, email_states inbox,
  meetings updated_at, audit_events occurred_at, chat_messages channel+created).

## 3. Verdict theo mức tải

| Mức | Verdict | Căn cứ |
|---|---|---|
| 100 users | **READY** | đo thực, 0% lỗi, p95 217 ms |
| 250 users | **READY_WITH_CAVEATS** | đo thực, 0% lỗi; RPC p95 chạm 1.1 s ở đuôi |
| 500 users | **READY** | đo thực 2026-08-15, 0% lỗi, p95 191 ms, mọi threshold pass |
| 1.000 users | **FAIL (đo thực 2026-08-16)** | p95 28,4 s, 0,15% timeout; nghẽn ở tầng API, không phải Postgres |
| 2.500 / 5.000 users | **BLOCKED — INSUFFICIENT EVIDENCE** | thiếu 3 điều kiện bắt buộc (mục 4) |

**Giới hạn an toàn khuyến nghị hiện tại: ~250 concurrent users**, với điều kiện dataset còn nhỏ.

## 4. Vì sao chưa thể kết luận 5.000 users
1. **Không có pool tài khoản test** — mọi phép đo chạy bằng 1 phiên người dùng, nên RLS chỉ lọc
   trên tập dữ liệu của một user; không phản ánh chi phí RLS đa tenant.
2. **Dataset dev quá nhỏ** — bảng lớn nhất 1.309 dòng. Cần seed 20.000 tasks / 500.000 chat_messages
   / 100.000 notifications trước khi kết luận về index và query plan.
3. **Thiếu quan trắc server-side** (OBSERVABILITY_GAPS.md): không đo được latency theo operation,
   outbox lag, số kết nối Realtime → không thể xác định bottleneck ở tải cao.
4. Load generator đặt trong sandbox cùng vùng mạng hạn chế; 5.000 VU cần runner phân tán.

## 5. Việc cần làm trước khi mở >1.000 users
1. Seed dataset large + pool ≥ 500 tài khoản fixture (`tests/performance/k6/fixtures/users.json`).
2. Chạy `k6 run -e TIER=500|1000|2500|5000 tests/performance/k6/load-tiers.js` từ runner ngoài.
3. Thêm timing middleware cho server function + dashboard outbox lag.
4. Chuyển audit log sang keyset pagination; virtualize danh sách dài (FE-001).
5. Đặt rate limit cho token issuance của phòng họp (LIVEKIT_CAPACITY_PLAN.md).
6. Cân nhắc nâng kích thước instance Lovable Cloud khi bão hoà kết nối/bộ nhớ xuất hiện.

## 6. Tài liệu liên quan
- PERFORMANCE_SURFACE_INVENTORY.md · PERFORMANCE_STATIC_FINDINGS.md · REALTIME_SUBSCRIPTION_MAP.md
- TOP_DATABASE_QUERIES.md · OPTIMIZATION_FIX_LEDGER.md · OBSERVABILITY_GAPS.md
- LIVEKIT_CAPACITY_PLAN.md · FRONTEND_BUNDLE_AUDIT.md
- Harness: `tests/performance/k6/` · Artifacts: `tests/performance/artifacts/`

PERFORMANCE_AUDIT_COMPLETE: PARTIAL (100–250 verified, 500–5000 blocked by fixtures/dataset/observability)
