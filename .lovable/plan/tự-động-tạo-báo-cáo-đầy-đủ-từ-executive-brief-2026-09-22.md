# Tự động tạo báo cáo đầy đủ từ Executive Brief

## Mục tiêu
Mỗi Executive Brief mới trong chat vẫn hiển thị ngắn gọn, nhưng Work Product đi kèm sẽ chứa một báo cáo hoàn chỉnh dựa trên cùng dữ liệu và quyền truy cập của người gửi.

## Phạm vi triển khai

### 1. Soạn báo cáo đầy đủ tự động
- Sau khi tạo Executive Brief, dùng chung AI Context Engine và các nguồn đã được lọc quyền để soạn báo cáo chi tiết.
- Báo cáo bắt buộc có: Tóm tắt điều hành, Mục tiêu, Chỉ tiêu/KPI, Kế hoạch hành động, Deadline, Phân công, Tiến độ Work Graph, Rủi ro và Nguồn.
- Không bịa KPI, hạn hoặc người phụ trách; trường thiếu dữ liệu phải ghi rõ “Chưa xác định” hoặc “AI đề xuất”.
- Với yêu cầu gắn Task, ưu tiên trạng thái, deadline, người phụ trách và số bước hoàn tất từ Work Graph thật.

### 2. Lưu Work Product và Work Graph
- Mở rộng command lưu Executive Brief để nhận nội dung báo cáo đã soạn ở máy chủ, đồng thời giữ Executive Brief gốc trong provenance/metadata.
- Lưu báo cáo là Work Product loại REPORT, phiên bản 1, có liên kết đến Task/Document/Meeting nguồn thật và chiếu Work Graph như hiện tại.
- Giữ idempotency, tenant isolation, RLS, outbox và không tạo writer thứ hai.
- Nếu bước soạn báo cáo chi tiết lỗi, vẫn lưu Executive Brief hiện có để không làm mất kết quả chat.

### 3. Hiển thị và kiểm thử
- Work Product mobile hiển thị trực tiếp đầy đủ các mục của báo cáo; Task liên quan vẫn mở được qua Work Graph.
- Kiểm thử một yêu cầu thật từ chat tại 440px, xác nhận Work Product được tạo tự động, có đủ mục, deadline/phân công/tiến độ đúng nguồn và không tràn ngang.
- Chạy kiểm tra kiểu, định dạng và migration/contract liên quan.

## Chi tiết kỹ thuật
- Dùng model/gateway hiện có; không thêm provider hoặc dependency.
- Truyền nội dung báo cáo vào RPC bằng tham số mới trong migration kế tiếp; RPC tự kiểm tra assistant message, tenant và root entity trước khi ghi.
- Provenance ghi rõ AI message, conversation, source entities và thời điểm tạo; Work Graph chỉ tạo liên kết với nguồn đã xác thực.
