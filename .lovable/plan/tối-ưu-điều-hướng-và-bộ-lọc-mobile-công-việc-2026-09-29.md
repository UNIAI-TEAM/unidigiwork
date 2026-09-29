# Tối ưu điều hướng và bộ lọc mobile — Công việc

## Thay đổi
- Trên mobile, thay hàng tab ngang bằng một nút chọn chế độ xem; bấm mở danh sách đầy đủ, không còn chữ bị cắt.
- Thêm nút **Lọc** rõ ràng; bấm mở bảng lọc từ cạnh dưới với ưu tiên, sắp xếp, nhãn và các điều kiện đang áp dụng.
- Giữ cách hiển thị tab và bộ lọc hiện tại trên tablet/desktop.
- Hiển thị số bộ lọc đang bật trên nút Lọc; hỗ trợ xóa bộ lọc và đóng bảng sau khi áp dụng.

## Kiểm tra
- Kiểm tra thao tác tại 390px và 820px: mở/chọn chế độ xem, mở/đóng bảng lọc, đổi ưu tiên/sắp xếp/nhãn.
- Xác nhận không tràn ngang, vùng chạm tối thiểu 44px và bản dựng không lỗi.

## Kỹ thuật
- Dùng các thành phần menu, bảng trượt và nút sẵn có của UniWork; không đổi dữ liệu hay nghiệp vụ lọc.
- Văn bản mới dùng hệ thống đa ngôn ngữ hiện có.
