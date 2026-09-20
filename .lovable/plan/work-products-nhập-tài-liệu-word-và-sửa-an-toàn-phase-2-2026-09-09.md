# Work Products — Nhập tài liệu Word và sửa an toàn (Phase 2)

Mục tiêu: đưa một file Word có sẵn vào UniWork thành "Kết quả công việc" có ngữ cảnh, có AI đề xuất, có duyệt của con người — mà **không bao giờ ghi đè bản gốc**.

Khối lượng rất lớn, nên chia 4 đợt. Mỗi đợt chạy được và kiểm chứng bằng file thật trước khi sang đợt sau.

## Đợt 1 — Nhập file Word và giữ bản gốc

- Nút "Nhập file Word" trong Kết quả công việc: chỉ nhận `.docx`, kiểm tra dung lượng, quyền, tổ chức/không gian làm việc.
- Lưu bản gốc vào kho riêng tư, tính mã kiểm tra SHA-256, ghi thành bản thể hiện **bất biến** (vai trò nguồn, bộ máy `ORIGINAL`).
- Đọc file bằng bộ máy GenOffice thật, tách thành các khối nội dung có **neo** về đúng đoạn trong file gốc (không đổ phẳng thành văn bản thường).
- Khối không sửa an toàn được đánh dấu "giữ nguyên, chỉ đọc".
- Kết quả công việc ghi rõ nguồn gốc: NATIVE hay IMPORTED_DOCX, kèm tên file, mã kiểm tra, thời điểm nhập.
- Tạo liên kết trong Work Graph, ghi nhật ký nguồn gốc.

## Đợt 2 — Sửa có kiểm soát và xem khác biệt

- Sửa của người dùng vào khối được hỗ trợ tạo ra **thay đổi chờ duyệt**, không đụng file gốc.
- Màn hình so sánh trước/sau theo từng khối: Chấp nhận / Từ chối / Tạo lại; chấp nhận tất cả / từ chối tất cả / chấp nhận mục đã chọn.
- Huy hiệu nhẹ trên tài liệu nhập: "DOCX · giữ nguyên bản gốc".
- Trên điện thoại: ưu tiên đọc, xem khác biệt, chấp nhận/từ chối, bình luận, duyệt, tải về.

## Đợt 3 — AI đề xuất và ghi vết

- Các lệnh AI hiện có (viết lại, rút gọn, mở rộng, dịch, tóm tắt, giọng chuyên nghiệp, hỏi AI) trả về **đề xuất**, không tự ghi vào tài liệu.
- **Sửa lỗ hổng bảo mật bắt buộc:** trình duyệt chỉ được gửi mã định danh nguồn ngữ cảnh; máy chủ tự phân quyền, tự nạp nội dung, tự dựng nguồn gốc. Không tin tiêu đề/trích đoạn do trình duyệt gửi.
- Phân tầng ngữ cảnh: liên quan trực tiếp (Work Graph) trước, gợi ý sau; hiển thị rõ AI đã dùng nguồn nào.
- Ghi vết đầy đủ: ai yêu cầu, mô hình, chỉ dẫn, khối bị sửa, trước/sau, nguồn ngữ cảnh, ai chấp nhận, phiên bản bộ máy GenOffice và commit.

## Đợt 4 — Vá file, kiểm chứng, phiên bản mới

- Chấp nhận xong: GenOffice **vá đúng chỗ** trên file gốc, không dựng lại toàn bộ tài liệu, không đi qua bộ máy nội bộ.
- Không vá an toàn được thì dừng, báo "phần này chưa sửa được mà vẫn giữ nguyên định dạng gốc", cho hủy hoặc tạo tài liệu mới.
- GenOffice hỏng thì thao tác vá báo lỗi rõ; mọi việc khác của Kết quả công việc vẫn chạy bình thường.
- Kiểm chứng sau khi vá: file mở được, các phần trong gói tài liệu giữ nguyên bao nhiêu, thay đổi bao nhiêu.
- Tạo phiên bản mới kèm file mới; file cũ không bao giờ bị thay thế; xem/khôi phục/tải từng phiên bản.
- Sửa lỗi duyệt: chỉ được duyệt đúng phiên bản hiện hành; nếu đã có phiên bản mới hơn thì báo "đã có phiên bản mới hơn, vui lòng duyệt bản mới nhất".
- "Tạo việc từ tài liệu": AI phát hiện việc/quyết định/cuộc họp, chỉ **đề xuất**; người dùng bấm tạo mới gọi hàm nghiệp vụ có sẵn và nối vào Work Graph.

## Bảo mật (chạy xuyên suốt, chặn phát hành)

- Rà soát và siết `can_view_work_entity`: kiểm tra tổ chức, thành viên không gian làm việc, quyền trên thực thể — không coi "thực thể tồn tại" là đủ quyền.
- Kiểm thử tấn công chéo tổ chức: nhập file, đọc bản thể hiện, dùng ngữ cảnh AI, nối Work Graph, tải liên kết ký, khóa dịch vụ không lộ ra trình duyệt.

## Kỹ thuật

- Bảng mới: `work_product_blocks` (neo OOXML, trạng thái sửa được), `work_product_change_ops` (thay đổi chờ, có tác giả/nguồn), `work_product_ai_proposals`.
- `work_products` thêm: `origin`, `source_artifact_id`, `source_sha256`, `source_filename`, `source_mime_type`, `source_engine`, `source_imported_at`.
- Bản thể hiện thêm vai trò `SOURCE_ORIGINAL` / `SOURCE_VERSION`, cột `engine` đã có.
- Định tuyến bộ máy: xuất native → BUILTIN; sửa DOCX nhập → GENOFFICE (không fallback); phòng thí nghiệm → COMPARE.
- Vá dùng `parseDocx`/`saveDocx` của GenOffice đã nhúng (commit `d24c964a…`), giữ nguyên khối không sửa (`kind: "original"`).
- Không mở rộng XLSX/PPTX/PDF trong đợt này.

## Nghiệm thu

Báo cáo `docs/audit/WORK_PRODUCTS_DOCX_ROUNDTRIP_ACCEPTANCE.md` với bằng chứng chạy thật: bộ file mẫu (hợp đồng tiếng Việt, đề xuất tiếng Anh, báo cáo song ngữ, tiêu đề, danh sách, bảng, ô gộp, ảnh, đầu/chân trang, ngắt trang, liên kết), kết quả nhập → sửa → AI đề xuất → chấp nhận → vá → phiên bản mới → tải về → mở lại, cùng số liệu giữ nguyên định dạng và kiểm thử cách ly tổ chức. Kết luận: PASS / PASS_WITH_LIMITATIONS / FAIL.
