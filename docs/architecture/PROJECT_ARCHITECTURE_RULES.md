# Project Architecture Rules (Core)

Nguồn: [Blueprint v1.0](./UNIWORK_SAAS_ARCHITECTURE_BLUEPRINT_V1.0.md), Chương 25 (30 quy tắc) + Chương 27 (DoD).
Đây là bản trích lược. Khi có bất kỳ mâu thuẫn nào, **Blueprint là quyền tối cao**.

## Core rules (phải áp dụng mỗi lượt)

1. **Blueprint là SSOT.** Yêu cầu mới xung đột với Blueprint → dừng, báo rõ quy tắc bị vi phạm, đề xuất phương án. Không tự ý đổi kiến trúc.
2. **Không dual-write.** Một bounded context chỉ có duy nhất một writer tại một thời điểm.
3. **Lovable Cloud / Supabase là production runtime chính thức** trong Giai đoạn 0–2.
4. **Java / Keycloak / MinIO / Redis chỉ là nhánh portability/on-prem.** Chưa cutover, chưa chạy writer song song, chưa đồng bộ hai chiều.
5. **Không thêm microservice trong Giai đoạn 0.** Modular monolith trước.
6. **Tenant ≠ Workspace.** Không đồng nhất trong schema hay domain model.
7. **Mọi bảng nghiệp vụ tenant-scoped phải có** `tenant_id`, `row_version`, `created_at`, `updated_at`, `created_by`, `updated_by`, và RLS scoped theo tenant.
8. **Command lifecycle quan trọng phải qua trusted boundary** (server function / RPC), không dùng generic PATCH; không direct-write từ component.
9. **Idempotency** cho command có khả năng retry (`idempotency_key`).
10. **Concurrency** bằng `row_version` cho mọi aggregate có mutate.
11. **Audit + Outbox** trong cùng transaction với mutate.
12. **Stable error codes** thống nhất giữa Lovable và Java.
13. **Không hard-code plan name.** Dùng `entitlements.can(feature)`.
14. **Không lưu public storage URL cố định.** DB chỉ lưu `storage_provider`, `bucket`, `object_key`.
15. **Không tự sinh LiveKit token ở client.** Server cấp token sau khi kiểm tra quyền và entitlement.
    Thiết kế chi tiết: [ADR-1E-001](./adr/ADR-1E-001-livekit-conferencing.md).
16. **Không lưu binary/video trong PostgreSQL.**
17. **AI không dùng service-role unrestricted access.**
18. **Không thay đổi API contract mà không version.**
19. **Không sửa schema production ngoài migration.**
20. **Frontend không tự xác định tenant hoặc quyền.**

## Cấm trong Giai đoạn 0

- Thêm feature UI mới.
- Thay đổi UI hiện tại (trừ khi bắt buộc để build pass).
- Tạo bảng tenant / thay schema / backfill dữ liệu (thuộc Batch 0B).
- Refactor toàn bộ Supabase caller (chỉ tạo manifest).
- Thêm dependency Keycloak / MinIO / Redis / Java.
- Thêm dependency LiveKit **ngoài** phạm vi batch LK-API/LK-UI đã được ADR-1E-001 phê duyệt.
- Commit secret hoặc credential mẫu có giá trị thật.

## Definition of Done (mỗi module)

Xem Blueprint §27. Ngắn gọn: UI đủ, API contract đủ, migration đủ, RLS đủ, permission đủ, tenant isolation test PASS, lifecycle test PASS, `row_version` + idempotency hoạt động, audit + outbox hoạt động, stable error code, realtime nếu có, không còn mock, build/typecheck/test PASS, có tài liệu migration Java, có rollback.
