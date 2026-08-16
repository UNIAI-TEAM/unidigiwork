# UNI ACTION UX V1

## Thẻ đề xuất
```
UNI đề xuất · Tạo công việc            [Cần bạn xác nhận]
Tiêu đề           Hoàn thiện API đăng nhập
Không gian        Hospital ERP
Người phụ trách   Nguyễn Văn Nam
Hạn               Thứ Sáu, 21/08 · 17:00
Đề xuất từ: Weekly ERP Review
[Xác nhận] [Chỉnh sửa] [Huỷ]
```

## Quy tắc UX
- Preview hiện đúng các trường sẽ ghi, nhãn tiếng Việt, không lộ UUID.
- Chỉnh sửa trước khi xác nhận: tiêu đề, mô tả, hạn, người phụ trách, thời gian họp, người nhận/nội dung thư.
- Mơ hồ (trùng tên, thiếu ngày, thiếu người nhận) → chặn nút Xác nhận, hiển thị lựa chọn.
- Không dark pattern: nút Xác nhận không preselect, không tự bấm, Enter trong ô nhập không kích hoạt xác nhận.
- Huỷ = không có tác động nghiệp vụ, đề xuất chuyển `CANCELLED`.

## Trạng thái kết quả
- Thành công: "Đã tạo công việc …" + nút Mở.
- Thất bại: thông điệp thân thiện, không lộ lỗi DB.
- Stale: "Dữ liệu đã thay đổi kể từ lúc UNI đề xuất. Vui lòng xem lại."

## Mobile
Thẻ đề xuất full-width trong bottom sheet của UNI, nút cao ≥ 44px, hàng nút dính đáy, tôn trọng safe-area.

## Accessibility
`section` có aria-label, mọi field có `<Label htmlFor>`, thao tác bằng bàn phím, không có xác nhận vô tình.
