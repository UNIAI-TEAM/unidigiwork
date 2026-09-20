# UniWork — Đối chứng bộ máy tạo tệp Office (DOCX)

Mọi số liệu dưới đây được đo trực tiếp từ tệp sinh ra, không có giá trị ước lượng.

## Môi trường

- Ngày chạy: 2026-09-09T13:14:12.382Z
- Runtime: Bun 1.3.3, Node v24.3.0, linux x64
- GenOffice upstream: genspark-ai/genoffice @ d24c964a3e693a52d9fece4fef03a4de34d0d853
- Gói bộ máy: docx-engine@0.1.0 (packages/docx-engine, Apache-2.0, loại trừ /ee)

## Chế độ A — Tạo mới DOCX

### Báo cáo đơn giản

- Đầu vào: nội dung gốc `simple-report` (78 ký tự)
- Kỳ vọng: Tiêu đề và các đoạn văn giữ nguyên, tệp mở được.
- Bộ máy thực thi: builtin=`builtin`, genoffice=`genoffice`

| Chỉ số | Builtin | GenOffice |
| --- | --- | --- |
| Mở được tệp | PASS | PASS |
| Đoạn văn | 7 | 5 |
| Tiêu đề | 1 | 2 |
| Bảng / dòng | 0/0 | 0/0 |
| Mục danh sách | 0 | 0 |
| Đậm/nghiêng/gạch | 3/0/0 | 0/1/0 |
| Ngắt trang | 1 | 0 |
| Từ trong nguồn bị thiếu | 0 | 0 |
| Dung lượng (byte) | 1969 | 3162 |
| Thời gian tạo (ms) | 20 | 188 |

- Độ trùng văn bản giữa hai tệp: 78.6%
- Kết luận: **PASS**

### Đề xuất có tiêu đề và danh sách

- Đầu vào: nội dung gốc `proposal-lists` (112 ký tự)
- Kỳ vọng: Tiêu đề nhiều cấp, danh sách gạch đầu dòng và đánh số đều xuất hiện.
- Bộ máy thực thi: builtin=`builtin`, genoffice=`genoffice`

| Chỉ số | Builtin | GenOffice |
| --- | --- | --- |
| Mở được tệp | PASS | PASS |
| Đoạn văn | 12 | 10 |
| Tiêu đề | 3 | 4 |
| Bảng / dòng | 0/0 | 0/0 |
| Mục danh sách | 5 | 5 |
| Đậm/nghiêng/gạch | 5/0/0 | 0/1/0 |
| Ngắt trang | 1 | 0 |
| Từ trong nguồn bị thiếu | 0 | 0 |
| Dung lượng (byte) | 2046 | 3255 |
| Thời gian tạo (ms) | 4 | 71 |

- Độ trùng văn bản giữa hai tệp: 83.3%
- Kết luận: **PASS**

### Tài liệu có bảng

- Đầu vào: nội dung gốc `table-doc` (100 ký tự)
- Kỳ vọng: Bảng 3 dòng được dựng đúng.
- Bộ máy thực thi: builtin=`builtin`, genoffice=`genoffice`

| Chỉ số | Builtin | GenOffice |
| --- | --- | --- |
| Mở được tệp | PASS | PASS |
| Đoạn văn | 9 | 9 |
| Tiêu đề | 2 | 2 |
| Bảng / dòng | 1/3 | 1/3 |
| Mục danh sách | 0 | 0 |
| Đậm/nghiêng/gạch | 4/1/0 | 2/1/0 |
| Ngắt trang | 0 | 0 |
| Từ trong nguồn bị thiếu | 2 | 2 |
| Dung lượng (byte) | 2074 | 3328 |
| Thời gian tạo (ms) | 5 | 47 |

- Độ trùng văn bản giữa hai tệp: 90%
- Kết luận: **PASS**
- Ghi chú: từ vắng ở bản GenOffice: /, |

### Định dạng nội tuyến và ngắt trang

- Đầu vào: nội dung gốc `styles-doc` (99 ký tự)
- Kỳ vọng: Đậm, nghiêng, gạch chân, trích dẫn và ngắt trang được ghi nhận.
- Bộ máy thực thi: builtin=`builtin`, genoffice=`genoffice`

| Chỉ số | Builtin | GenOffice |
| --- | --- | --- |
| Mở được tệp | PASS | PASS |
| Đoạn văn | 7 | 7 |
| Tiêu đề | 2 | 2 |
| Bảng / dòng | 0/0 | 0/0 |
| Mục danh sách | 0 | 0 |
| Đậm/nghiêng/gạch | 3/3/1 | 1/3/1 |
| Ngắt trang | 1 | 0 |
| Từ trong nguồn bị thiếu | 3 | 3 |
| Dung lượng (byte) | 2071 | 3239 |
| Thời gian tạo (ms) | 2 | 30 |

- Độ trùng văn bản giữa hai tệp: 93.1%
- Kết luận: **PASS**
- Ghi chú: từ vắng ở bản GenOffice: chân., nghiêng,, đậm,

### Tài liệu tiếng Việt

- Đầu vào: nội dung gốc `vietnamese` (83 ký tự)
- Kỳ vọng: Dấu tiếng Việt hiển thị đúng, không mất chữ.
- Bộ máy thực thi: builtin=`builtin`, genoffice=`genoffice`

| Chỉ số | Builtin | GenOffice |
| --- | --- | --- |
| Mở được tệp | PASS | PASS |
| Đoạn văn | 4 | 4 |
| Tiêu đề | 2 | 2 |
| Bảng / dòng | 0/0 | 0/0 |
| Mục danh sách | 0 | 0 |
| Đậm/nghiêng/gạch | 2/1/0 | 0/1/0 |
| Ngắt trang | 0 | 0 |
| Từ trong nguồn bị thiếu | 0 | 0 |
| Dung lượng (byte) | 1960 | 3185 |
| Thời gian tạo (ms) | 2 | 48 |

- Độ trùng văn bản giữa hai tệp: 92.3%
- Kết luận: **PASS**

### Tài liệu tiếng Anh

- Đầu vào: nội dung gốc `english` (76 ký tự)
- Kỳ vọng: Nội dung tiếng Anh giữ nguyên.
- Bộ máy thực thi: builtin=`builtin`, genoffice=`genoffice`

| Chỉ số | Builtin | GenOffice |
| --- | --- | --- |
| Mở được tệp | PASS | PASS |
| Đoạn văn | 4 | 4 |
| Tiêu đề | 2 | 2 |
| Bảng / dòng | 0/0 | 0/0 |
| Mục danh sách | 0 | 0 |
| Đậm/nghiêng/gạch | 2/1/0 | 0/1/0 |
| Ngắt trang | 0 | 0 |
| Từ trong nguồn bị thiếu | 0 | 0 |
| Dung lượng (byte) | 1917 | 3140 |
| Thời gian tạo (ms) | 21 | 80 |

- Độ trùng văn bản giữa hai tệp: 89.5%
- Kết luận: **PASS**

### Tài liệu song ngữ

- Đầu vào: nội dung gốc `mixed` (93 ký tự)
- Kỳ vọng: Cả hai ngôn ngữ cùng xuất hiện, không lỗi ký tự.
- Bộ máy thực thi: builtin=`builtin`, genoffice=`genoffice`

| Chỉ số | Builtin | GenOffice |
| --- | --- | --- |
| Mở được tệp | PASS | PASS |
| Đoạn văn | 4 | 4 |
| Tiêu đề | 2 | 2 |
| Bảng / dòng | 0/0 | 0/0 |
| Mục danh sách | 0 | 0 |
| Đậm/nghiêng/gạch | 2/1/0 | 0/1/0 |
| Ngắt trang | 0 | 0 |
| Từ trong nguồn bị thiếu | 0 | 0 |
| Dung lượng (byte) | 1937 | 3161 |
| Thời gian tạo (ms) | 11 | 67 |

- Độ trùng văn bản giữa hai tệp: 92%
- Kết luận: **PASS**

## Chế độ B — Đọc, sửa và ghi lại DOCX có sẵn

- Đầu vào: `source.docx` do pandoc tạo (gói OOXML tương thích Microsoft Word).
- Thao tác: sửa đúng một đoạn (`30 ngày` → `60 ngày`) rồi ghi lại bằng GenOffice.

| Chỉ số | Giá trị |
| --- | --- |
| Số khối trong tài liệu | 8 |
| Số khối bị sửa | 1 |
| Phần OOXML giữ nguyên | 13 |
| Phần OOXML thay đổi | 1 (word/document.xml) |
| Phần thêm mới | 0 |
| Phần bị mất | 0 |
| Tỷ lệ giữ nguyên | 92.9% |
| Tệp gốc mở được | PASS |
| Tệp sau khi ghi mở được | PASS |
| Bảng gốc / sau khi ghi | 1/2 → 1/2 |
| Mục danh sách gốc / sau | 2 → 2 |

- Không tuyên bố giữ nguyên từng byte của toàn gói: chỉ `word/document.xml` thay đổi khi có sửa nội dung; các phần còn lại trùng khớp mã băm SHA-256.

## Tổng hợp năng lực

| Năng lực | Builtin | GenOffice |
| --- | --- | --- |
| Tạo mới DOCX | Có | Có |
| Trung thực văn bản | Đạt | Đạt |
| Bảng | Đạt | Đạt |
| Định dạng chữ | Đạt | Đạt |
| Đọc DOCX có sẵn | Không | Có |
| Giữ nguyên khi ghi lại | Không áp dụng | Đo được, chỉ đổi phần bị sửa |
| Hiệu năng trung bình | 9 ms | 76 ms |
| Độ phức tạp tích hợp | Thấp | Trung bình (nhúng mã nguồn Apache-2.0) |

## Khuyến nghị

**HYBRID** — bộ máy nội bộ cho kết xuất nhanh từ nội dung gốc (DOCX/XLSX/PPTX/PDF);
bộ máy GenOffice cho các tình huống cần đọc và sửa DOCX có sẵn, nơi việc giữ nguyên phần OOXML không đụng tới là bắt buộc.
Căn cứ: GenOffice là bộ máy duy nhất trong hai bộ máy đọc được DOCX bên ngoài và ghi lại chỉ đổi phần bị sửa; ở chế độ tạo mới, hai bộ máy tương đương về trung thực nội dung nhưng bộ máy nội bộ nhanh hơn và hỗ trợ đủ bốn định dạng.
