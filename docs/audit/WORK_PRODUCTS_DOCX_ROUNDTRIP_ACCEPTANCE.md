# WORK PRODUCTS — DOCX ROUND-TRIP & AI EDITING ACCEPTANCE

Ngày: 2026-09-09 · Phạm vi: Phase 2 (DOCX only) · Kiến trúc: HYBRID (Builtin mặc định, GenOffice cho DOCX nhập vào)

## 1. Tóm tắt triển khai

| Hạng mục | Trạng thái |
| --- | --- |
| Nhập DOCX, giữ bản gốc bất biến | ĐÃ LÀM |
| Phân tích DOCX thành khối có neo (`docxIndex`) | ĐÃ LÀM |
| Phân loại `EDITABLE` / `READ_ONLY_PRESERVED` | ĐÃ LÀM |
| Thay đổi chờ duyệt (human) | ĐÃ LÀM |
| Đề xuất AI theo khối (không tự ghi) | ĐÃ LÀM |
| Ngữ cảnh AI do máy chủ tự nạp (không tin trình duyệt) | ĐÃ LÀM |
| Đối chiếu diff + Accept/Reject/Accept All | ĐÃ LÀM |
| Vá phẫu thuật bằng GenOffice thật | ĐÃ LÀM |
| Kiểm chứng bảo toàn OOXML sau vá | ĐÃ LÀM |
| Artifact mới + phiên bản mới + provenance | ĐÃ LÀM |
| Chặn duyệt phiên bản cũ (`REVIEW_STALE`) | ĐÃ LÀM |
| Cổng an toàn `PATCH_UNSAFE` (không fallback ngầm) | ĐÃ LÀM |
| "Create work from this" (đề xuất Task/Decision) | CHƯA LÀM |
| Bộ fixture 14 loại tài liệu đầy đủ | LÀM MỘT PHẦN |
| Test cách ly tenant chạy thật cho luồng mới | CHƯA CHẠY |

## 2. Kiến trúc

```
DOCX gốc (immutable, SOURCE_ORIGINAL, engine=ORIGINAL, sha256)
   ↓ parseDocx (GenOffice)
work_product_blocks (blockKey ↔ docxIndex)
   ↓ human edit / AI proposal
work_product_change_ops (PENDING → ACCEPTED)
   ↓ patchDocxAnchored (GenOffice saveDocx, khối không sửa giữ kind:"original")
DOCX mới (SOURCE_VERSION, engine=GENOFFICE) + work_product_versions v(n+1) + provenance
```

Mã nguồn chính:
- `src/lib/api/docx-import.server.ts` — parse/neo/vá/PATCH_UNSAFE
- `src/lib/api/work-products-docx.functions.ts` — import, blocks, change ops, AI proposal, apply
- `src/lib/api/office-compare.server.ts` — kiểm chứng OOXML
- `src/components/work-products/docx-roundtrip-panel.tsx` — UI diff review
- GenOffice upstream: `genspark-ai/genoffice`, commit `d24c964a3e693a52d9fece4fef03a4de34d0d853`, Apache-2.0, chỉ `packages/docx-engine`, loại trừ `/ee`.

## 3. Bằng chứng chạy thật

`bun run scripts/docx-roundtrip-smoke.ts` (hợp đồng tiếng Việt + Anh, heading, bullet, bảng):

```
blocks: 9 editable: 8
target: wp-block-5 EDITABLE {"docxIndex":5,"styleId":null,"level":null}
edited: 1 / 9
preservation: {"unchangedParts":5,"changedParts":1,"addedParts":0,"removedParts":0,
               "changed":["word/document.xml"],"preservedRatio":83.3}
opens: true missing: []
has 60 days: true
old text gone: true
tables preserved: 1 headings: 3 listItems: 2
SAFETY: PATCH_UNSAFE ANCHOR_NOT_FOUND:x
```

Đọc lại tệp đã vá bằng pandoc: nội dung tiếng Việt có dấu đúng, heading/bullet/bảng còn nguyên, chỉ đoạn được chấp nhận thay đổi:

```
Thời hạn thanh toán là 60 (sáu mươi) ngày kể từ ngày nhận hoá đơn hợp lệ.
```

Chỉ `word/document.xml` thay đổi; 0 phần thêm, 0 phần mất — đúng kỳ vọng của vá phẫu thuật.

## 4. An toàn & bảo mật

- Bản gốc không bao giờ bị ghi đè: artifact mới luôn có `role=SOURCE_VERSION`, khoá lưu trữ mới theo phiên bản.
- Neo không khớp / nội dung gốc đã đổi / khối không sửa được → `PATCH_UNSAFE`, dừng trước khi ghi bất cứ byte nào; không có fallback sang bộ máy nội bộ.
- GenOffice hỏng chỉ ảnh hưởng thao tác round-trip; tạo/sửa/duyệt/xuất tài liệu native vẫn chạy bình thường.
- Ngữ cảnh AI: trình duyệt chỉ gửi `{type, id}`; máy chủ tự nạp nội dung chuẩn theo RLS (`collectContextSources`) rồi mới dựng prompt và provenance. Đã sửa cả `runWorkDeliverableAi`.
- Duyệt phiên bản: `decideWorkDeliverableReview` từ chối `APPROVED` nếu `review.version ≠ current_version` (`REVIEW_STALE`).
- Bí mật dịch vụ Office Engine chỉ tồn tại phía máy chủ.

## 5. Giới hạn đã biết

1. Chưa triển khai "Create work from this" (đề xuất Task/Decision từ tài liệu).
2. Bộ fixture mới phủ hợp đồng Việt–Anh có heading/bullet/bảng; chưa phủ ảnh, header/footer, section break, merged cell, hyperlink trong luồng nhập-vá đầu-cuối.
3. Chưa chạy test tự động cách ly tenant cho các endpoint mới (`import`, `blocks`, `change_ops`, `apply`); bảo vệ hiện dựa trên RLS và helper `can_view/can_edit_work_product`.
4. `can_view_work_entity()` chưa được rà soát lại theo yêu cầu mục 20.
5. Nhập tài liệu qua base64 (giới hạn 25MB), chưa dùng upload luồng.
6. 321 cảnh báo security-linter của dự án (phần lớn có sẵn từ trước) chưa xử lý.

## 6. Kết luận

**PASS_WITH_LIMITATIONS**

Luồng lõi — nhập DOCX, giữ bản gốc, AI đề xuất, người duyệt, GenOffice vá phẫu thuật, kiểm chứng OOXML, phiên bản + provenance — đã chạy thật và có bằng chứng. Chưa đạt PASS đầy đủ vì còn thiếu "Create work from this", bộ fixture mở rộng, test cách ly tenant chạy thật cho endpoint mới và rà soát `can_view_work_entity()`.
