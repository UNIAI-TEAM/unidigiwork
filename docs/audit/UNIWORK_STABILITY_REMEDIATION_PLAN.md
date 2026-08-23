# UNIWORK — STABILITY REMEDIATION PLAN

## STAB-1 — Dead control & core journey (chặn customer pilot)
1. P1 `/tasks` "Tạo công việc": nối CTA vào quick-create dialog + `create_task` RPC, verify bằng reload + DB row.
2. P1 `/documents` "Tạo tài liệu mới": nối vào `create_document`, chứng minh persistence.
3. P2 `/documents` sửa truy vấn `workspace_members` (bỏ embed `profiles(...)`, join qua server function).
4. P1 Topbar: thay danh tính cứng "Nguyễn Văn A / Giám đốc Điều hành" bằng user thật.

## STAB-2 — Gỡ mock trên route thương mại
5. P1 `/meeting` KPI (4 họp / 1 LIVE / 12 bản ghi / 38 tóm tắt) → query thật hoặc empty-state.
6. P1 `/email` nhãn, tài khoản, dung lượng → dữ liệu thật; ghi nhãn rõ "email nội bộ", không gọi là email ngoài.
7. P2 `/documents` Storage 342.6 GB → số thật hoặc ẩn.
8. P2 `/tasks` mô tả dự án cứng "STOS" → mô tả workspace thật.

## STAB-3 — Persistence, đa người dùng, realtime, cache
9. P2 Bộ test persistence chuẩn (action → DB → hard reload) cho mọi write path.
10. P2 Sửa harness `tests/runtime/product-audit/probe.mjs` (server-fn ID đã lỗi thời) để CI có bằng chứng runtime lại.
11. P2 Thống nhất cổng tenant cho các route cấp cao (`/tasks`, `/meeting`, `/knowledge`, `/workflows`, `/ai`, `/reports`).
12. P2 Sửa hydration mismatch `<html class="dark">`.

## STAB-4 — Hiệu năng & nợ kỹ thuật
13. P1 Seed dataset đại diện + chạy lại 100/250/500 VU, công bố tier mới.
14. P2 Kiểm chứng LiveKit runtime, transcript/summary, workflow trigger, AI task execution end-to-end.
15. P3 UX: `/admin` cho tenant_owner nên giải thích cách xin quyền thay vì chặn trắng.
