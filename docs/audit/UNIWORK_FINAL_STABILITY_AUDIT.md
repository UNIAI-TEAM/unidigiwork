# UNIWORK — FINAL PRODUCT STABILITY AUDIT (v1.0)

Ngày: 2026-08-23 · Runtime: dev server localhost:8080 + Lovable Cloud (Supabase) thật
Phương pháp: INVENTORY → TRACE → RUNTIME VERIFY (Playwright, 2 actor thật) → DB EVIDENCE.
Bằng chứng: `tests/runtime/stability-audit/artifacts/`.

## Điều kiện chạy audit

- DB nghiệp vụ đã được reset sạch trước audit (empty-tenant state).
- Hai actor thật: `stab_a@example.com` (tenant "Stab Audit A"), `stab_b@example.com` (tenant "Stab Audit B"), tạo bằng auth thật, không service_role giả lập quyền.
- Không sửa RLS, không mock, không tắt lỗi.

## Kết luận nhanh

| Cổng phát hành | Kết quả |
|---|---|
| INTERNAL_PILOT_READY | YES (có cảnh báo) |
| CUSTOMER_PILOT_READY | NO |
| COMMERCIAL_READY | NO |

Lý do chặn: (1) CTA chính "Tạo công việc" trên `/tasks` là DEAD_CONTROL — không mở dialog, không gọi backend, không ghi DB; (2) nhiều màn hình thương mại vẫn hiển thị số liệu mock (Họp, Email Hub, Storage, danh tính người dùng ở topbar); (3) `/documents` gọi `workspace_members` lỗi HTTP 400; (4) chưa có bằng chứng hiệu năng mới sau các thay đổi gần đây.

## Bằng chứng runtime cốt lõi

| Hạng mục | Bằng chứng | Trạng thái |
|---|---|---|
| Đăng nhập email/password | UI thật → session → redirect `/tasks` | PASS_REAL |
| Onboarding tenant 3 bước | 2 tenant thật được tạo (`tenants=3`) | PASS_REAL |
| Guard `_authenticated` | Không tenant → ép về `/onboarding` | PASS_REAL |
| Cách ly tenant (task) | Actor B không thấy dữ liệu tenant A | PASS_REAL |
| Cách ly tenant (search) | Truy vấn cross-tenant không trả kết quả | PASS_REAL |
| Tạo task từ UI | Không có dialog, 0 request, `tasks` không tăng | DEAD_CONTROL / P1 |
| Tạo document từ UI | Click được nhưng `documents = 0` sau thao tác | NO_OP / P1 |
| `/documents` → workspace_members | HTTP 400 (embed `profiles(...)` không hợp lệ) | BROKEN / P2 |
| UNI Copilot (⌘J) | Panel mở, trả nội dung | PASS_UI (chưa chứng minh grounding) |
| Route health 22 route | Tất cả HTTP 200, không blank/500 | PASS_UI |
| `/admin` với tenant_owner | Chặn "Không có quyền truy cập" | FAIL_CLOSED_SAFE (UX gap) |
| Hydration | Cảnh báo mismatch `<html class="dark">` mọi route | P2 |
| Hiệu năng | Không chạy lại 100/250/500 VU trong phiên này | BLOCKED |

## Ghi chú trung thực

- Harness cũ `tests/runtime/product-audit/probe.mjs` **hỏng** (server-function ID `?tss-serverfn-split` không còn hợp lệ ở dev → HTTP 500 giả). Mọi kết quả 500 từ harness đó **không** phải lỗi sản phẩm; đã bỏ qua và thay bằng kiểm thử trình duyệt thật.
- Không có bằng chứng nào cho: LiveKit runtime, transcript/summary thật, email gửi ra ngoài, workflow trigger thật, PWA offline. Tất cả để BLOCKED/UNVERIFIED, không PASS.
