# Cải thiện kéo thả và resize Dashboard

## Mục tiêu
- Kéo card đổi vị trí mượt, không đổi chỗ liên tục khi con trỏ vẫn nằm trên cùng một card.
- Resize được từ cạnh phải, cạnh dưới và góc dưới-phải.
- Lưu cả chiều rộng và chiều cao theo tài khoản, giữ nguyên sau khi tải lại.

## Thay đổi
- Mở rộng card kéo thả với vùng nắm rõ ràng, vùng resize lớn hơn và phản hồi trực quan khi thao tác.
- Thêm các mức chiều cao phù hợp: Tự động, Thấp, Vừa, Cao; nội dung dài cuộn bên trong thay vì làm vỡ bố cục.
- Giữ lưới 12 cột hiện tại cho chiều rộng; trên màn hình nhỏ card vẫn một cột và dùng nút điều chỉnh dễ chạm.
- Chống gọi lưu liên tục trong lúc kéo: cập nhật trực quan ngay, chỉ đồng bộ cấu hình khi kết thúc thao tác.
- Giữ tương thích với cấu hình cũ; card chưa có chiều cao sẽ dùng chế độ Tự động.

## Kiểm tra
- Thử kéo đổi vị trí và resize theo ba hướng trên Dashboard.
- Tải lại để xác nhận chiều rộng, chiều cao và thứ tự được giữ nguyên.
- Kiểm tra desktop, tablet và mobile không tràn ngang, vùng thao tác mobile tối thiểu 44px.

## Kỹ thuật
- Mã hóa chiều cao trong namespace `dashboard.*` hiện có, không thêm bảng hay migration.
- Mở rộng `DraggableGridCard` bằng resize trục X/Y/XY và callback kết thúc thao tác.
- Không thay đổi dữ liệu nghiệp vụ hoặc các card Dashboard hiện có.
