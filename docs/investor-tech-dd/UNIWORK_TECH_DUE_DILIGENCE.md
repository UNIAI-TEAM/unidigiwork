# UNIWORK — Technical Due Diligence Pack

Phiên bản: 1.0 · Ngày: 2026-08-28 · Nguồn kiến trúc: `docs/architecture/UNIWORK_SAAS_ARCHITECTURE_BLUEPRINT_V1.0.md`

## 1. Tóm tắt cho nhà đầu tư

UNIWORK là nền tảng Work OS đa tenant nơi nhân sự người và **nhân sự AI** cùng thực thi công việc.
Điểm khác biệt kỹ thuật không nằm ở "có AI", mà ở **lớp quản trị AI**: mọi lượt AI chạy đều
đi qua orchestrator có hợp đồng, có bằng chứng, có kiểm định chất lượng và **luôn dừng lại
để con người nghiệm thu** trước khi dữ liệu nghiệp vụ thay đổi.

| Chỉ số | Giá trị |
|---|---|
| Mã nguồn ứng dụng | ~128k dòng TypeScript/TSX, 435 file |
| Route sản phẩm | 98 |
| Bảng dữ liệu (public) | 114 — **114/114 bật RLS** |
| Chính sách RLS | 212 |
| Hàm/RPC nghiệp vụ | 312 |
| Migration có phiên bản | 204 |
| Kiểm thử tự động (CI) | 220 test / 29 file — xanh 100% |
| Kiểm thử runtime bảo mật | 78/78 kịch bản tamper PASS (`/mnt/documents/wp-tamper/`) |

## 2. Kiến trúc

- **Modular monolith** trên TanStack Start (React 19, SSR edge) + Lovable Cloud (Postgres).
- **16 bounded context**, mỗi context có đúng **một writer** — không dual-write
  (`docs/architecture/manifests/DOMAIN_OWNERSHIP_MANIFEST.md`).
- **Portability**: lớp `src/platform/*` trừu tượng hoá identity, storage, realtime nên có thể
  chuyển sang Keycloak/MinIO/on-prem mà không sửa mã nghiệp vụ. Chưa cutover — đây là
  lựa chọn giảm rủi ro khoá nhà cung cấp, không phải nợ kỹ thuật.
- **Command lifecycle** đi qua RPC/server function tin cậy; component không ghi trực tiếp.
  Bất biến này được **CI ép buộc** bằng `src/lib/architecture/*.test.ts`.

## 3. Cách ly dữ liệu đa tenant

- Mọi bảng nghiệp vụ có `tenant_id`, `row_version`, audit fields.
- RLS dùng helper `is_tenant_member` / `has_tenant_role`, không so sánh `uid` thô.
- `audit_events` bất biến (trigger chặn UPDATE/DELETE).
- Kiểm chứng: gate tĩnh trong CI + bộ E2E 78 kịch bản gồm 14 case cách ly tenant và
  13 case danh tính/JWT (hết hạn, giả chữ ký, mạo danh) — tất cả fail-closed, không rò dữ liệu.

## 4. Quản trị AI (khác biệt cạnh tranh)

Pipeline WEE-1: `CONTEXT → PLAN → GENERATE → ACTION → VALIDATE → REVIEW`.

1. **Orchestrator chỉ đọc.** Không có đường ghi dữ liệu nghiệp vụ; bước ACTION chỉ sinh
   `ai_action_proposals` ở trạng thái `PROPOSED`.
2. **Trạng thái kết thúc của AI** chỉ được là `WAITING_REVIEW` hoặc `FAILED`. `ACCEPTED` là
   trạng thái **chỉ con người** ghi được.
3. **Hợp đồng kế hoạch nghiêm ngặt** (`src/domain/work-execution/plan-schema.ts`): output model
   được kiểm bằng Zod, `actionIntent` giới hạn trong enum đóng, mọi payload database do model
   tự chèn đều bị loại bỏ.
4. **Chính sách model tập trung** (`src/domain/ai-policy/model-policy.ts`): mỗi năng lực
   (planning/generation/evaluation…) có allowlist model riêng, không còn literal model rải rác.
5. **Phòng vệ prompt injection**: nội dung người dùng luôn được đánh dấu "KHÔNG ĐÁNG TIN CẬY".
6. **WEE-2 governance**: tool registry + risk model, `evaluateAiWorkerActionPolicy` fail-closed.
7. **WEE-3 quality**: chấm chất lượng theo tiêu chí nghiệm thu, có bằng chứng truy vết.

Tất cả bất biến trên đều có test gate (`src/lib/architecture/ai-task-execution.test.ts`) — vi phạm
kiến trúc làm **đỏ CI**, không phụ thuộc kỷ luật con người.

## 5. Kinh tế đơn vị (Sell Work)

- `work_execution_metrics` đo chi phí AI theo **rate có phiên bản** (`ai_model_cost_rates`,
  `rate_version` / `rate_effective_at`) — chi phí quá khứ không bị viết lại khi giá đổi.
- Chi phí con người chỉ nhận cấu hình tường minh; thiếu cấu hình ⇒ đánh dấu `UNKNOWN`,
  không suy đoán.
- Độ tin cậy số liệu phân loại `FULL / PROVISIONAL / NOT_RELIABLE` theo completeness.
- Cohort proof: `EARLY (5) → PROVISIONAL (20) → PROVEN (50)` mẫu.

## 6. Bảo mật — trạng thái hiện tại

Đã khắc phục trong đợt hardening này:

| Vấn đề | Mức | Trạng thái |
|---|---|---|
| `profiles` lộ email cho mọi tài khoản đăng nhập | Cao | Đã siết: chỉ chính chủ hoặc người cùng tenant |
| `demo_requests` (lead PII) đọc được bởi mọi tài khoản | Cao | Đã siết: chỉ admin/moderator |
| Giả mạo thông báo sang người dùng bất kỳ | Trung bình | Đã siết: người nhận phải cùng workspace |
| Endpoint nền xác thực bằng khoá công khai | Trung bình | Đã thay bằng `CRON_SECRET` phía máy chủ |
| Chưa bật chống mật khẩu rò rỉ | Thấp | Đã bật (HIBP) |
| `.env` không được gitignore | Cao | Đã khắc phục — xem `docs/security/INVESTOR_SECRET_HYGIENE.md` |

Nợ đã biết, có chủ đích (không phải lỗ hổng): 300 cảnh báo linter dạng
"SECURITY DEFINER function executable" — đây là các RPC nghiệp vụ **cố ý** cho phép gọi,
mỗi hàm tự kiểm quyền và tenant bên trong (fail-closed), vì đó là ranh giới tin cậy của hệ thống.

## 7. Rủi ro & lộ trình

| Rủi ro | Giảm thiểu |
|---|---|
| Xoay vòng secret từng bị commit | Bắt buộc trước due diligence chính thức (Gate 1 report) |
| Một số module frontend quá lớn (`admin.trace.tsx`, `meeting.tsx`) | Kế hoạch tách module, không ảnh hưởng hợp đồng API |
| Ma trận cross-tenant runtime cần fixture 2 tenant | Chạy như CI gate ngoài; hiện có gate tĩnh + E2E |
| Phụ thuộc AI Gateway | Chính sách model cho phép đổi vendor qua một điểm cấu hình |
