# UNIWORK — OBSERVABILITY GAP REPORT

| Signal | Trạng thái | Ghi chú |
|---|---|---|
| Correlation ID xuyên request → DB → outbox | ĐÃ CÓ | `_set_correlation_context`, `/api/admin/trace/$correlationId` |
| Audit events cho command chính | ĐÃ CÓ | trigger `audit_row_change` + `audit_child_row_change` |
| Outbox metrics (lag, retry, dead-letter) | THIẾU | chưa có view/route đo `pending age p95`, `retry_count`, dead-letter |
| Server-side latency per operation (p50/p95/p99) | THIẾU | không có timing middleware trên server function |
| Slow query alert | THIẾU | có `pg_stat_statements` nhưng không có ngưỡng/alert |
| Realtime connection count & message rate | THIẾU | không đo được từ app |
| Error rate theo route/operation | MỘT PHẦN | `error-capture.ts` gom lỗi client, chưa gom theo operation server |
| Quota / usage counters | ĐÃ CÓ | `quota_check_events`, `usage_counters`, `/admin/quota` |
| RUM (LCP/INP/CLS) | THIẾU | chưa gửi web-vitals |
| Load-test result store | THIẾU | chưa có CI job lưu artifact k6 |

**Khuyến nghị tối thiểu trước khi mở tải >1.000 users:** timing middleware cho server function
(ghi `operation, duration_ms, tenant_id, correlation_id`), dashboard outbox lag, và web-vitals RUM.
