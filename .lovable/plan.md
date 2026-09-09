# GenOffice thật + đối chứng bộ máy Office (DOCX)

## Điều đã xác minh
- Mã nguồn GenOffice công khai tồn tại: `genspark-ai/genoffice`, commit hiện tại `d24c964a3e693a52d9fece4fef03a4de34d0d853`, giấy phép Apache-2.0.
- Không có API `/render` chính thức nào. Đúng như bạn nói, đây là bộ ứng dụng máy tính; phần dùng lại được nằm ở `packages/docx-engine` (TypeScript thuần, chỉ phụ thuộc `jszip` + `fast-xml-parser`).
- `docx-engine` có đủ hai thứ cần cho phép thử: tạo mới (`buildBlankDocx`, `generateParagraphXml`, `generateTableModelXml`) và đọc–vá–ghi tài liệu Word có sẵn (`parseDocx`, `saveDocx`), tức là kiểm được cả chế độ giữ nguyên định dạng gốc.
- Không có `/ee` trong các gói sẽ dùng.

## Cách làm
Vì mã GenOffice là TypeScript thuần, nó chạy được ngay trong nền tảng hiện tại. Ta vẫn giữ ranh giới dịch vụ rõ ràng để sau này tách ra máy chủ riêng mà không phải viết lại:

```text
Kết quả công việc → OfficeEngineAdapter → Office Engine Service
                                             ├─ nội bộ (mặc định)
                                             └─ HTTP GENOFFICE_URL (nếu cấu hình)
                                          → mã GenOffice OSS đã nhúng
```

- Nhúng `packages/docx-engine` vào `vendor/genoffice/docx-engine` kèm LICENSE, NOTICE và ghi rõ commit gốc. Không lấy giao diện máy tính, không lấy thương hiệu.
- Giữ nguyên bộ máy nội bộ hiện có. Không thay thế.

## Các phần sẽ làm

1. **Nhúng và tài liệu hoá nguồn gốc**
   `vendor/genoffice/` + `THIRD_PARTY_NOTICES.md`, ghi commit SHA và phiên bản gói.

2. **Dịch vụ kết xuất**
   `POST /api/internal/office/v1/render`, xác thực bằng khoá bí mật máy chủ–máy chủ (`OFFICE_ENGINE_SERVICE_SECRET`), trả tệp nhị phân kèm `x-office-engine`, `x-office-engine-version`, `x-genoffice-commit`. Không công khai.

3. **Adapter chọn bộ máy**
   `renderOfficeArtifact(req, { engine })` với `AUTO | BUILTIN | GENOFFICE | COMPARE`. `AUTO` giữ nguyên hành vi an toàn hiện tại. Mọi lần xuất đều ghi lại bộ máy thực tế đã dùng; không bao giờ gán nhãn genoffice cho tệp do bộ máy nội bộ tạo.

4. **Lưu kết quả đối chứng**
   Bảng `work_product_engine_benchmarks` (tenant_id, work_product_id, version, format, hai artifact id, commit SHA, thời gian, trạng thái PENDING/RUNNING/PASSED/FAILED/PARTIAL, comparison_json, created_by) + RLS theo đúng quy tắc hiển thị của Kết quả công việc.

5. **Hàm đối chứng**
   `benchmarkOfficeEngines(workProductId, version, format)`: kiểm quyền → nạp đúng phiên bản và nguồn gốc → kết xuất hai lần → lưu hai tệp riêng, gắn nhãn `engine=builtin` / `engine=genoffice`, không đụng tệp bàn giao chính → tính chỉ số → lưu và trả báo cáo.

6. **Chỉ số đo được**
   Toàn vẹn tệp (mở được, ZIP hợp lệ, đủ phần OOXML, quan hệ phân giải), cấu trúc (đoạn, tiêu đề, bảng, ảnh, danh sách, section, đầu/chân trang, liên kết), độ trung thực văn bản, định dạng chữ, siêu dữ liệu bố cục, thời gian kết xuất, dung lượng. Chỉ hiển thị số đo thật.

7. **Phép thử giữ nguyên tài liệu gốc**
   Nhập một DOCX chuẩn Microsoft → GenOffice đọc → sửa một đoạn → ghi lại; băm từng phần OOXML và phân loại UNCHANGED / CHANGED / ADDED / REMOVED. Không tính siêu dữ liệu vỏ ZIP là thay đổi nội dung.

8. **Giao diện “So sánh bộ máy Office”**
   Trong `/work-products/:id`, ẩn với người dùng thường, chỉ mở cho quản trị qua cờ tính năng. Hiện thẻ chỉ số hai cột, tải riêng từng tệp, xem chi tiết kỹ thuật. Không tự tuyên bố bên nào thắng.

9. **Báo cáo**
   `WORK_PRODUCTS_OFFICE_ENGINE_BENCHMARK.md` với môi trường, chín ca thử (báo cáo đơn giản, đề xuất có tiêu đề và danh sách, tài liệu có bảng, có ảnh, DOCX có sẵn, DOCX sửa một đoạn, tiếng Việt, tiếng Anh, song ngữ), bảng tổng hợp và khuyến nghị dựa trên bằng chứng.

## Ranh giới an toàn
- Khoá bí mật chỉ nằm ở phía máy chủ, không lộ ra trình duyệt.
- Nếu bộ máy GenOffice hỏng, việc xuất tệp bình thường vẫn chạy bằng bộ máy nội bộ; phép đối chứng ghi `GENOFFICE_UNAVAILABLE`.
- Không lưu nội dung tài liệu cho mục đích thống kê, chỉ ghi siêu dữ liệu; tệp tạm bị xoá; không vượt ranh giới tổ chức.

## Phạm vi đợt này
Chỉ DOCX. PPTX, PDF, XLSX để đợt sau sau khi có kết luận.
