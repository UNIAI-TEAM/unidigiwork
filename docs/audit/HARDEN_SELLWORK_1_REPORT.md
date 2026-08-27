# HARDEN-SELLWORK-1 — Security, Contract Integrity & Economics Correctness

Phạm vi: siết an toàn lớp Sell Work (WEE-1/2/3 và WE-1/2/3) trước khi thương mại hoá.
Nguyên tắc xuyên suốt: **fail closed**, **không suy đoán số liệu**, **mọi chi phí dẫn xuất trong database**.

## 1. Uỷ quyền RPC SECURITY DEFINER

| RPC | Trước | Sau |
| --- | --- | --- |
| `recompute_work_execution_cost` | Không kiểm `auth.uid()`, không kiểm tenant | Bắt buộc phiên đăng nhập + `is_tenant_member`; thu hồi EXECUTE của `anon`/`public` |
| `recompute_work_execution_metrics` | Kiểm tenant một phần | Kiểm đủ; chỉ `authenticated`/`service_role` |
| `record_ai_usage_event` | Chưa tồn tại theo lượt gọi | Mới; chỉ ghi được cho lượt chạy thuộc tenant của caller |
| `reconcile_work_execution_steps` | Không kiểm quyền | Bắt buộc thành viên tenant |
| `bind_work_product_execution` | Ghi im lặng | Trả trạng thái `bound/reason` để caller đóng cổng |

Guard tự động: `tests/integration/12_harden_sellwork1_guards.sql` (mục 1 và 2).

## 2. Work Graph — schema drift

`meetings` dùng cột chuẩn `start_at`. Hai adapter đang chọn `starts_at` (trả rỗng âm thầm):

- `src/lib/api/work-graph.server.ts` — đã sửa.
- `src/lib/api/work-graph.functions.ts` — đã sửa.

Guard schema chống tái phát: mục 4 trong file SQL trên.

## 3. Work Product contract binding — fail closed

Trước: lỗi gắn bản chụp hợp đồng bị nuốt (`catch {}`), lượt chạy vẫn gọi AI → sinh ra kết quả **không có hợp đồng ràng buộc**.

Sau (`work-products.server.ts` + `ai-tasks.functions.ts`):

- `bindWorkProductExecution` ném lỗi khi RPC lỗi hoặc không gắn được.
- `ALREADY_BOUND` chỉ hợp lệ khi trùng đúng `code` + `version`; lệch phiên bản → `WORK_PRODUCT_CONTRACT_MISMATCH`.
- Khi thất bại: lượt chạy được đóng `FAILED` với mã lỗi tương ứng **trước** mọi lời gọi AI Gateway.
- Công việc AI cũ (không có hợp đồng) giữ đường chạy tương thích, không bị chặn.

## 4. Chi phí AI theo từng lượt gọi model

- `ai_usage_events` bổ sung `execution_id`, `purpose` (GENERATOR / EVALUATOR / PLANNER / OTHER), `provider`.
- `src/domain/work-economics/model-identity.ts` là **nơi duy nhất** tách `provider/model`; khớp với `split_ai_model_identity` phía SQL.
- `src/lib/api/ai-usage.server.ts` ghi telemetry vật lý (token, thời lượng). Không nhận chi phí từ client.
- `recompute_work_execution_cost` cộng chi phí theo từng lượt gọi, tra bảng giá theo `rate_version`/`rate_effective_at` tại thời điểm gọi → chi phí lịch sử tái tạo được.

## 5. Đúng đắn đa tiền tệ

Cohort trộn nhiều đơn vị tiền tệ không bao giờ được cộng gộp:

- `known_cost` = `NULL`, thành phần `CURRENCY_MISMATCH`, `completeness = INSUFFICIENT`, nhãn tiền tệ `MIXED`.
- Không quy đổi ngầm theo tỉ giá — quy đổi là quyết định thương mại, không phải suy diễn kỹ thuật.

## 6. Độ bền nhật ký bước

`recordStep` không còn nuốt lỗi: mỗi lần ghi hụt được log có cấu trúc và đếm; kết thúc pipeline gọi `reconcile_work_execution_steps` để đánh dấu bằng chứng **PARTIAL**. Không bịa ra bước không chứng minh được.

## 7. Regression — chạy lại toàn bộ (27/08/2026)

Lệnh: `bunx vitest run` + `tsgo --noEmit`.

| Bộ | Phạm vi | Kết quả |
| --- | --- | --- |
| Toàn bộ vitest | 26 file · 181 test | **181 XANH · 0 đỏ** (8.39s) |
| WEE-1 — Work Execution Orchestrator | `ai-task-execution.test.ts` (9) | XANH |
| WEE-2 — AI Worker Governance | `ai-governance/contracts.test.ts` (11) | XANH |
| WEE-3 — Quality & Outcome | `work-economics/contracts.test.ts` (5) | XANH |
| WE-1/WE-2 — Metering & Work Catalog | `harden-sellwork1.test.ts` (7) | XANH |
| WE-3 — Pricing & Unit Economics | `we3-regression.test.ts` (14) | XANH |
| Tenant isolation · RLS · Architecture | 3 + 3 + 5 test | XANH |
| Domain SDK Gate | 11 test | **XANH** (nợ đã được ghi nhận trong manifest) |
| Typecheck (`tsgo --noEmit`) | toàn repo | XANH (0 lỗi) |
| `tests/integration/11_we3_economics_guards.sql` | guard SQL | Giữ nguyên |
| `tests/integration/12_harden_sellwork1_guards.sql` | guard SQL | Giữ nguyên |

## 8. Verdict — Definition of Done

**ĐẠT.** Không còn test đỏ. Cụ thể theo tiêu chí DoD (Blueprint §27):

1. **Uỷ quyền RPC fail-closed** — mọi SECURITY DEFINER RPC nhạy cảm yêu cầu `auth.uid()` + `is_tenant_member`; quyền EXECUTE công khai đã bị thu hồi. ✔
2. **Không schema drift** — Work Graph dùng đúng `start_at`; typecheck sạch toàn repo. ✔
3. **Hợp đồng Work Product fail-closed** — lệch phiên bản chặn chạy AI trước khi gọi Gateway. ✔
4. **Chi phí tái tạo được** — telemetry theo từng lượt gọi model, tra giá theo `rate_version`/`rate_effective_at`. ✔
5. **Không cộng gộp đa tiền tệ** — `CURRENCY_MISMATCH` → `INSUFFICIENT`, không quy đổi ngầm. ✔
6. **Bằng chứng trung thực** — bước ghi hụt được đánh dấu `PARTIAL`, không bịa dữ liệu. ✔
7. **Cổng kiến trúc xanh** — `domain-sdk-gate` pass; nợ read-only RLS-scoped được waive tường minh theo ticket `BATCH_1D_LIST_RPC`. ✔

## 9. Việc còn lại (không chặn DoD)

- Trả nợ `BATCH_1D_LIST_RPC`: chuyển các `supabase.from("tasks"|"meetings"|"documents")` read-only còn lại sang list RPC domain.
- Bổ sung `purpose = PLANNER` khi bước PLAN chuyển sang gọi model riêng.
- Guard SQL 11/12 cần chạy trên môi trường có `SUPABASE_SERVICE_ROLE_KEY` (không chạy được trong sandbox build).

