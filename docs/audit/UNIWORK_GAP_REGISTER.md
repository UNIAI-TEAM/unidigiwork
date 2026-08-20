# UNIWORK — Gap Register (P0 → P3)

| # | Gap | Domain | Bằng chứng | Ảnh hưởng | Ưu tiên |
|---|---|---|---|---|---|
| G1 | AI Task Execution chưa từng chạy: `ai_task_executions` = 0 | AI | DB count | MVP1 "AI làm việc thật" chưa được chứng minh | P0 |
| G2 | Meeting Intelligence chưa có transcript/summary thật (3 bảng = 0) | Meeting | DB count | Không bán được "AI họp" | P0 |
| G3 | Thanh toán không hoạt động: thiếu `STRIPE_SECRET_KEY` | Billing | secrets scan | Không thu tiền được → không Sell Work | P0 |
| G4 | Email Hub là email nội bộ DB, không có SMTP/IMAP outbound | Email | không có provider/secret | Người dùng hiểu nhầm là email thật | P0 |
| G5 | 26/173 case isolation fail-closed trên documents/email | Security/UX | tenant-isolation artifacts | Người hợp lệ bị chặn ở vài đường đọc | P1 |
| G6 | Còn `notifyComingSoon` ở /reports (8) và /people (6) | UX | rg | Nút chết trong luồng demo | P1 |
| G7 | LiveKit Egress: `meeting_recordings` = 0 | Meeting | DB | Ghi hình chưa chứng minh | P1 |
| G8 | AI Workspace chưa có hội thoại/usage thật (3 bảng = 0) | AI | DB | Không đo được chi phí AI | P1 |
| G9 | Push/PWA offline chưa chứng minh (`push_subscriptions` = 0) | Mobile | DB | Trải nghiệm native chưa xác nhận | P2 |
| G10 | Quota export job chưa chạy lần nào | Ops | DB | Báo cáo hạn mức chưa dùng được | P2 |
| G11 | Không có Decision Hub như blueprint | Product | route scan | Thiếu 1 domain trong tầm nhìn | P2 |
| G12 | Task comments/attachments chưa có dữ liệu & chưa test | Tasks | DB | Cộng tác quanh task chưa xác nhận | P2 |
| G13 | Chat dữ liệu cực mỏng (4 tin) — realtime chưa đo tải | Chat | DB | Rủi ro khi có người dùng thật | P3 |
| G14 | Không có SLA/observability dashboard vận hành | Ops | docs/performance | Khó cam kết dịch vụ | P3 |
