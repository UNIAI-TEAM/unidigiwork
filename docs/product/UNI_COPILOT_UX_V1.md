# UNI COPILOT — UX SPEC V1

## Entry points
- **Global**: nút UNI nổi ở góc phải dưới + phím tắt `⌘J` / `Ctrl J` (⌘K vẫn là Universal Search). Lệnh "Hỏi UNI…" trong ⌘K mở panel, không chạy LLM trong search.
- **Contextual**: nút "Hỏi UNI" trên Project, Task, Meeting, Email, Document, Chat — mở cùng panel với root context tương ứng.

## Desktop
Side panel phải, rộng 420px, không che toàn màn hình, không rời khỏi trang đang làm việc.

## Mobile
Panel full-screen từ dưới top-16, composer cố định trên safe-area, nguồn có target ≥44px.

## Trạng thái
Closed → Open → "Đang kiểm tra dữ liệu liên quan..." → "Đang tổng hợp..." → Answer → Error (kèm Thử lại). Nút Dừng khi đang chạy.

## Thành phần câu trả lời
1. Answer (trích dẫn `[S1]` là link bấm được)
2. Sections theo intent (Tóm tắt / Rủi ro / Ưu tiên / Đề xuất / So sánh)
3. Ambiguity: liệt kê đối tượng trùng tên, không tự chọn
4. Partial notice khi thiếu nguồn
5. Nguồn (thu gọn, "Đã tham chiếu N nguồn")
6. 2–3 follow-up read-only + Sao chép

## Context chip
Hiển thị "Ngữ cảnh: Dự án · <tên>", có nút "Bỏ" để chuyển global. Điều hướng sang entity khác → reset thread + báo "Đã chuyển ngữ cảnh sang …".

## Gợi ý mặc định
Global: ưu tiên hôm nay / quá hạn / chờ phản hồi / họp sắp tới / hoạt động gần đây.
Theo entity: xem `suggestionsForRoot()`.

## Không có trong V1
Nút hành động (hoàn thành, gửi email, giao việc). Chỉ điều hướng "mở đối tượng".
