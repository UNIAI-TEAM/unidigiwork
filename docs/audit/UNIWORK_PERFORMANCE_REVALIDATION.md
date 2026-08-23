# UNIWORK — PERFORMANCE REVALIDATION

## Trạng thái: KHÔNG CÓ BẰNG CHỨNG MỚI (BLOCKED)

- Bằng chứng cũ trong `tests/performance/artifacts/` (50/250/500/1000 VU) được ghi nhận là **HISTORICALLY_PROVEN**, không phải bằng chứng hiện tại.
- Không chạy lại 100/250/500 VU trong phiên audit này: k6 không được thực thi, và dataset đã bị reset sạch nên fixture không còn đại diện (mọi truy vấn danh sách trả 0 dòng → kết quả sẽ lạc quan giả).
- Không có số req/s, p50/p95/p99, error rate mới. Không bịa số.

## Vì sao baseline cũ không còn đáng tin

Kể từ mốc Tier-500, sản phẩm đã thêm/đổi: Work Graph + search_universal, AI Context Engine, Meeting Intelligence, AI Action Layer, AI Workforce/Market, Home V2, realtime meetings. Các đường đọc nóng đã đổi hình dạng truy vấn → benchmark cũ không phủ được.

## Mức concurrency có thể bảo vệ bằng bằng chứng hiện tại

**Không mức nào.** Muốn công bố lại, cần: seed dataset đại diện → chạy `tests/performance/k6/load-tiers.js` ở 100 → 250 → 500 VU, chỉ chạy 1000 VU sau khi 500 VU xanh. Tuyệt đối không tuyên bố 5000.
