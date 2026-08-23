# UNIWORK — ROUTE HEALTH (runtime)

22 route đã crawl bằng trình duyệt thật với actor có tenant. Bằng chứng: `tests/runtime/stability-audit/artifacts/route-health.json`.

| Route | HTTP | Kết quả |
|---|---|---|
| /home /dashboard /tasks /calendar /documents /chat /meeting /email /search /notifications /people /workspace /knowledge /workflows /ai /ai-workforce /ai-market /billing /settings /admin /reports /m | 200 | Render đầy đủ, không blank, không error boundary |

Ghi chú:
- Khi user chưa có tenant, các route dưới `_authenticated` redirect đúng về `/onboarding`; nhưng `/tasks`, `/meeting`, `/knowledge`, `/workflows`, `/ai`, `/reports` (route cấp cao) vẫn render app shell không cần tenant → **không đồng nhất cổng tenant (P2)**.
- `/documents`: 1 request nền lỗi HTTP 400 (`workspace_members` embed `profiles`).
- `/admin`: hiển thị "Không có quyền truy cập" với tenant_owner (fail-closed, đúng bảo mật, sai kỳ vọng UX).
- Cảnh báo hydration mismatch (`<html class="dark">`) xuất hiện ở mọi route.
