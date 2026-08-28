# Gate 1 — Secret Hygiene Report

Ngày rà soát: 2026-08-28. Phạm vi: toàn repo + cấu hình runtime.

## Kết quả

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| `.env` bị theo dõi trong repo | ĐÃ KHẮC PHỤC | `.gitignore` nay loại `.env`, `.env.*`, `.dev.vars`, `*.pem`, `*.key`; giữ `!.env.example` |
| Mẫu biến môi trường | ĐÃ CÓ | `.env.example` chỉ liệt kê **tên biến**, không giá trị |
| Secret trong mã nguồn | KHÔNG PHÁT HIỆN | Không có API key/secret hardcode trong `src/` |
| Secret phía máy chủ | ĐẠT | `LOVABLE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_*`, `CRON_SECRET` chỉ đọc trong handler máy chủ |
| Rò rỉ qua bundle trình duyệt | ĐẠT | Chỉ `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (khoá công khai theo thiết kế) |

## Hành động bắt buộc cho vận hành

Giá trị LiveKit/Supabase từng nằm trong `.env` được commit phải được **xoay vòng (rotate)**
trước khi mở due diligence với bên thứ ba. Danh sách cần xoay:

- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` (xoay qua công cụ hạ tầng của Lovable Cloud)

## Xác thực job nền (Gate 24)

Trước đây `/api/public/hooks/*` chỉ so sánh header `apikey` với khoá publishable —
khoá này nằm sẵn trong bundle trình duyệt nên **không phải cơ chế xác thực**.

Nay mọi endpoint nền dùng chung `src/lib/api/cron-auth.server.ts`:

- Bắt buộc header `x-cron-secret` (hoặc `Authorization: Bearer …`) khớp `CRON_SECRET`.
- So sánh theo thời gian hằng số (constant-time).
- Không cấu hình secret ⇒ **từ chối** (fail-closed), không có nhánh mở mặc định.

Ba job `pg_cron` (`process-outbox-every-minute`, `livekit-reconcile-2min`,
`process-quota-exports`) đã được cập nhật để gửi header mới.
