# CEO Command Center — đánh giá và phương án

## 1. Đánh giá dữ liệu hiện có (đã kiểm tra trong hệ thống)

Có sẵn, dùng được ngay:
- Công việc: 64 việc thật, có trạng thái, tiến độ %, ngày bắt đầu/kết thúc, hạn, người/AI phụ trách.
- Kết quả AI: bảng kết quả thực thi có trạng thái, điểm chất lượng, đạt/không đạt, người duyệt, thời điểm duyệt → tính được "số việc có kết quả và review đạt / tổng được tạo".
- Thời lượng máy và thời lượng thực tế của từng lượt AI, số token, số lượt gọi, mô hình → quy ra "giờ AI" theo từng nhân sự AI.
- Chi phí: chi phí AI, chi phí người (theo chính sách đơn giá), độ đầy đủ dữ liệu.
- Họp, dự án, thảo luận, nhật ký hoạt động, đề xuất của Bộ não AI.

Thiếu, cần nói rõ với CEO thay vì bịa:
- **Không có chấm công/timesheet cho người.** Hệ thống không ghi giờ làm của từng nhân sự người. Giờ người sẽ là **ước tính** từ: thời lượng họp thực tế + số việc hoàn thành × đơn giá thời gian trong chính sách chi phí người. Mọi chỗ hiển thị đều gắn nhãn "ước tính" và cho bấm xem cách tính.
- Doanh thu/doanh số không có trong hệ thống → các thẻ tiền tệ chỉ hiển thị khi có dữ liệu chi phí thật; không dựng số doanh thu giả như ảnh mẫu.

## 2. Phương án màn hình

Một màn mới `/ceo` (nhóm Tổ chức), chỉ chủ sở hữu/quản trị tổ chức xem được. Bố cục theo đúng tinh thần ảnh gửi:

1. **Lời chào + ngày** và dải **3 việc cần chú ý** do hệ thống tự chọn: Cần quyết định (đề xuất/duyệt đang chờ, kèm số ngày chờ và số việc bị chặn), Cần can thiệp (chỉ số xấu đi so với kỳ trước), Theo dõi (điểm nóng đã ổn định).
2. **Bộ lọc kỳ**: Ngày · Tuần · Tháng · Quý · 6 tháng · Năm — mọi chỉ số bên dưới đổi theo kỳ và luôn so với kỳ liền trước.
3. **4 thẻ tổng**: Tổng công việc, Hoàn thành, Đang thực hiện, Quá hạn (kèm % và mũi tên so kỳ trước).
4. **Chuyển dịch Người ↔ AI**: vòng tròn tỉ lệ việc do người / do AI, và đường xu hướng theo kỳ để thấy dịch chuyển. Thêm chỉ số đòn bẩy AI: tỉ lệ việc có AI tham gia, tỉ lệ kết quả AI được duyệt đạt.
5. **Thời gian làm việc**: giờ AI (thật, từ thời lượng thực thi) và giờ người (ước tính), bảng **từng nhân sự** — người và AI đứng chung một bảng: tên, vai trò, số việc, giờ, việc hoàn thành, tỉ lệ đạt review.
6. **Chất lượng kết quả**: tổng việc tạo ra kết quả / tổng việc, số kết quả được review, tỉ lệ đạt, tỉ lệ trả lại sửa.
7. **Theo bộ phận/không gian làm việc**: thanh Người vs AI vs Tổng.
8. **4 câu hỏi của CEO** — trả lời bằng số thật của kỳ đang chọn:
   - Chúng ta đã bỏ ra nguồn lực gì? → giờ người (ước tính), giờ AI, chi phí đã ghi nhận.
   - Nguồn lực đó tạo ra sản phẩm gì? → số việc hoàn thành, số kết quả công việc, số tài liệu/quyết định.
   - Sản phẩm đó tạo ra thay đổi và giá trị gì? → tỉ lệ đạt review, thời gian tiết kiệm nhờ AI, xu hướng quá hạn.
   - Thay đổi đó tạo giá trị kinh tế/năng lực gì? → chi phí trên mỗi kết quả đạt, đòn bẩy AI, số việc AI gánh thay người.
9. **Vấn đề cần xử lý**: danh sách rủi ro tự phát hiện — việc quá hạn nhiều ngày, việc ì ạch không cập nhật, kết quả AI chờ duyệt quá lâu, nhân sự quá tải, dự án lệch tiến độ. Mỗi dòng bấm được sang đúng việc/dự án.

Mọi thẻ đều mở được chi tiết (drill-down) sang danh sách việc tương ứng, không phải số chết.

## 3. Kỹ thuật

- Thêm `src/lib/api/ceo.functions.ts` (server function có xác thực, giới hạn theo tổ chức) + `ceo.server.ts` chứa truy vấn tổng hợp theo kỳ và kỳ trước.
- Tổng hợp bằng SQL/RPC theo `tenant_id`, đọc: `tasks`, `ai_task_executions`, `work_execution_metrics`, `work_execution_costs`, `ai_usage_events`, `meetings`, `ai_workers`, `ai_action_proposals`, `users`.
- Route mới `src/routes/_authenticated/ceo.tsx` + các thành phần trong `src/components/ceo/`.
- Không tạo bảng mới, không đổi RLS, không đụng nghiệp vụ hiện có. Chỉ đọc.
- Giao diện theo hệ màu và token hiện tại (Cloud White, chữ hiện hành), responsive 3 cột desktop → 1 cột điện thoại, nút chạm tối thiểu 44px.
- Thêm mục "CEO" vào menu Tổ chức, có tiếng Việt và tiếng Anh.

## 4. Phạm vi không làm
- Không thêm doanh thu/CRM giả.
- Không tạo chấm công người; giờ người là ước tính có ghi chú.
- Không sửa AI Brain, Skill Hub, dự án, công việc.
