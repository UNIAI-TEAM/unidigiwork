# Work Products — kết quả công việc (MVP)

## Kết quả kiểm tra hệ thống hiện tại

- Ứng dụng đã có: khung giao diện chung (sidebar + topbar), đăng nhập, tổ chức/không gian làm việc, Dự án, Công việc, Cuộc họp, Tài liệu, Email, Chat, Kiến thức, Nhân sự AI, Tìm kiếm toàn cục, Thông báo, Nhật ký kiểm toán, chế độ tối, bản điện thoại.
- Đã có sẵn **Work Graph** (`work_nodes` / `work_edges` + hàm liên kết) — sẽ dùng lại, không tạo hệ liên kết thứ hai.
- Đã có module **Tài liệu** với bản ghi, phiên bản, chia sẻ, nhật ký truy cập — sẽ dùng lại làm nền lưu trữ nội dung/tệp.
- **Lưu ý tên gọi:** trong hệ thống đã tồn tại "Work Products" mang nghĩa *hợp đồng sản phẩm công việc* (`/work-catalog`, bảng `work_units`). Module mới sẽ dùng nhãn tiếng Việt **"Kết quả công việc"** và đường dẫn `/work-products`, còn phần cũ giữ nhãn **"Danh mục hợp đồng công việc"** để tránh nhầm.

## Phạm vi làm ngay (MVP)

### Dữ liệu
- `work_products`: tiêu đề, mô tả, **loại nghiệp vụ** (đề xuất, báo cáo, phân tích, hợp đồng, kế hoạch, thuyết trình...) tách hoàn toàn khỏi **định dạng** — đây là bất biến lâu dài, một Đề xuất có thể tồn tại đồng thời ở dạng native + DOCX + PDF. Ngoài ra: trạng thái (nháp → đang xem xét → yêu cầu sửa → đã duyệt → hoàn tất → lưu trữ), chủ sở hữu, phiên bản hiện tại, người/AI tạo, `tenant_id`.
  - **Không gắn cứng project_id.** Quan hệ nghiệp vụ đi qua Work Graph. Chỉ giữ một `primary_context` (loại + id, cho phép rỗng) để hiển thị "thuộc về đâu" trên danh sách.
- `work_product_artifacts`: mỗi kết quả có **nhiều biểu diễn** (native source, DOCX, PDF, XLSX...), mỗi bản ghi có định dạng, vai trò (nguồn/xuất bản/xem trước), tham chiếu lưu trữ, kích thước, kiểu MIME. Không lấy một `storage_key` đơn nhất làm trung tâm.
- `work_product_versions`: số phiên bản, ảnh chụp nội dung + biểu diễn tại thời điểm đó, tóm tắt thay đổi, người/AI tạo, và **ảnh chụp nguồn gốc**: danh sách nguồn ngữ cảnh đã dùng kèm loại, id, tiêu đề và dấu phiên bản/thời điểm của nguồn (ví dụ Quyết định #182 tại phiên bản nào). Sau này nguồn đổi thì bản ghi kiểm toán vẫn chứng minh được.
- `work_product_comments`: bình luận, trả lời, đánh dấu đã xử lý.
- `work_product_reviews`: yêu cầu xem xét, người xem xét, hạn, kết quả duyệt/yêu cầu sửa (sinh sự kiện kiểm toán).
- Liên kết công việc dùng **Work Graph sẵn có**: bổ sung loại thực thể `WORK_PRODUCT` và các quy tắc quan hệ (thuộc dự án, tạo từ cuộc họp, tham chiếu quyết định/công việc/tài liệu, dẫn xuất từ kết quả khác).
- Toàn bộ bảng mới có `tenant_id`, bật RLS theo thành viên tổ chức + thành viên dự án, cấp quyền đúng vai trò.

### Máy chủ
- `work-products.*.functions.ts` mới (tên tách bạch với file hợp đồng cũ): danh sách + lọc, tạo, cập nhật nội dung/tiêu đề, tải tệp lên, ghi phiên bản, bình luận, yêu cầu xem xét, duyệt/yêu cầu sửa, lấy ngữ cảnh liên quan.
- Mọi thao tác thay đổi trạng thái đi qua server function (không ghi trực tiếp từ giao diện).
- `OfficeEngineAdapter`: lớp trừu tượng mở/đọc/xuất docx/xlsx/pptx/pdf. MVP dùng khả năng sẵn có (xem trước tệp gốc, soạn thảo nội dung native), để trống chỗ cắm engine sau.

### Giao diện
- `/work-products`: tiêu đề "Kết quả công việc — Từ ngữ cảnh công việc đến sản phẩm hoàn chỉnh", bộ lọc (tất cả/tài liệu/phân tích/thuyết trình/PDF, gần đây, của tôi, dự án, loại, trạng thái), ô tìm kiếm, chuyển danh sách ↔ lưới, trạng thái rỗng/đang tải/lỗi/không có quyền.
- Hộp thoại tạo 2 bước: chọn loại + mẫu → gắn ngữ cảnh (dự án, cuộc họp, công việc, tài liệu, chủ sở hữu) → tạo.
- `/work-products/:id`: ba vùng — trái (ngữ cảnh, thu gọn được), giữa (trình soạn thảo nội dung: tiêu đề, in đậm/nghiêng/gạch chân, danh sách, liên kết, bảng, ảnh, hoàn tác, tự lưu), phải (Nhân sự AI / Ngữ cảnh / Nhận định, thu gọn được). Có chế độ tập trung.
- **Chọn nguồn ngữ cảnh tường minh:** tab Ngữ cảnh liệt kê rõ AI đang dùng Dự án / Cuộc họp / Quyết định / Kiến thức nào, mỗi nguồn có công tắc bật–tắt; chỉ nguồn đang bật mới được gửi cho AI và mới được ghi vào nguồn gốc phiên bản.
- Thanh công cụ AI khi bôi đen: Hỏi AI, Cải thiện, Rút gọn, Mở rộng, Viết lại, Dịch — luôn hiện bản xem trước với Chấp nhận / Từ chối / Tạo lại; chỉ ghi khi người dùng chấp nhận, và ghi lại nguồn ngữ cảnh đã bật.
- Phiên bản: xem trước, so sánh (nội dung native), khôi phục.
- "Tạo việc từ nội dung này": AI đề xuất công việc/quyết định/họp tiếp theo, luôn cần người xác nhận.
- Bản điện thoại: đọc, bình luận, AI, duyệt — không soạn thảo đầy đủ.

### Tích hợp
- Sidebar: thêm mục ở nhóm KNOWLEDGE, dùng đúng cấu hình điều hướng sẵn có.
- Tìm kiếm toàn cục: bổ sung nguồn kết quả công việc vào hàm tìm kiếm hiện có.
- Trang Home/Hộp việc: thẻ "chờ bạn duyệt" và "AI đã tạo bản nháp".
- Từ Dự án / Cuộc họp / Quyết định: nút "Tạo kết quả công việc" liên kết ngược.
- Thông báo tái dùng hệ thống hiện có.

### Kiểm thử & tài liệu
- Kiểm thử cách ly tổ chức (đọc/ghi/liên kết/phiên bản/ngữ cảnh AI trái phép đều phải thất bại).
- Đi hết hành trình nghiệm thu: tạo từ dự án → soạn → AI sửa → ghi phiên bản → gắn quyết định → yêu cầu duyệt → duyệt → tìm kiếm thấy.
- Xuất `WORK_PRODUCTS_IMPLEMENTATION_REPORT.md`.

## Không làm trong MVP
Bản sao Word/Excel/PowerPoint, công thức bảng tính nâng cao, hiệu ứng thuyết trình, sửa PDF nâng cao, đồng soạn thảo thời gian thực, tích hợp engine tài liệu bên ngoài (chỉ chuẩn bị lớp cắm).

## Cách triển khai theo đợt
1. Dữ liệu + bảo mật + liên kết Work Graph.
2. Trang danh sách + tạo mới + trang chi tiết với soạn thảo và tự lưu.
3. Phiên bản, bình luận, xem xét, duyệt, nguồn gốc thay đổi.
4. AI (thanh công cụ chọn văn bản, bảng AI, tạo việc từ nội dung).
5. Tích hợp tìm kiếm/Home/liên kết ngược, bản điện thoại, kiểm thử, báo cáo.
