# UniWork k6 harness

Chạy ngoài sandbox (CI hoặc load generator riêng). Sandbox Lovable KHÔNG đủ tài nguyên
để sinh 1.000+ VUs → kết quả sandbox chỉ dùng cho smoke.

```bash
export SUPABASE_URL=...            # project URL
export SUPABASE_ANON_KEY=...       # publishable key (KHÔNG dùng service role)
export K6_USERS_FILE=./fixtures/users.json

k6 run -e TIER=100  tests/performance/k6/load-tiers.js
k6 run -e TIER=250  tests/performance/k6/load-tiers.js
k6 run -e TIER=500  tests/performance/k6/load-tiers.js
k6 run -e TIER=1000 tests/performance/k6/load-tiers.js
k6 run -e TIER=2500 tests/performance/k6/load-tiers.js
k6 run -e TIER=5000 tests/performance/k6/load-tiers.js --summary-export tests/performance/artifacts/load-5000.json
```

fixtures/users.json: mảng `{ email, password, tenant }`, mỗi VU một tài khoản riêng
(§13, §89). Seed bằng service role ở bước chuẩn bị, không dùng service role khi bắn tải.
