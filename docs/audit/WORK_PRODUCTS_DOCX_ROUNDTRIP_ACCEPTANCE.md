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

## 18. Tạo công việc từ tài liệu Word đã nhập — HOÀN THÀNH

- `proposeTasksFromWorkProduct`: AI đọc các block đã neo, đề xuất tối đa 10 công việc (title + priority). Không tạo dữ liệu.
- `createTasksFromWorkProduct`: chỉ chạy sau khi người dùng chọn; gọi RPC `create_task` dưới RLS của người dùng, rồi `link_work_entities(WORK_PRODUCT → TASK, GENERATES)`. Idempotency key theo từng dòng.
- UI: thẻ "Tạo công việc từ tài liệu" trong `DocxRoundTripPanel` với danh sách gợi ý có checkbox.
- Cách ly tổ chức (kiểm tra chính sách DB):
  - `work_products_select` → `wp_scope_allows(...)` bắt buộc `is_tenant_member(tenant_id)`.
  - `work_product_blocks` / `work_product_change_ops` → `can_view_work_product` / `can_edit_work_product`, cùng gốc kiểm tra tenant.
  - `work_edges_select/delete` → `is_tenant_member(tenant_id)` + tồn tại node hai đầu.
  - `create_task` chạy dưới RLS người dùng → workspace khác tổ chức bị từ chối tại DB, không phụ thuộc kiểm tra ở tầng ứng dụng.
- Quan hệ `WORK_PRODUCT GENERATES TASK` đã tồn tại trong `work_relationship_types`.

### 18.1 Kiểm tra cách ly hai tổ chức trên dữ liệu thật — PASS

Chạy trực tiếp trên DB với `role authenticated` + `request.jwt.claims` của từng người dùng.

| Bước | Chủ thể | Kết quả |
| --- | --- | --- |
| `create_task` trong workspace của mình | Tenant A (`d0ebb237…`, user `7177e35b…`) | Tạo task `3c0dcbef-204b-4bd0-b525-bbe9b8b984b9` |
| `link_work_entities(WORK_PRODUCT → TASK, GENERATES)` | Tenant A | Edge `c2190141-0555-48b3-be5c-754b7118cd5e`, `tenant_id = d0ebb237…` |
| Đọc `work_products` / `work_product_blocks` / `work_product_artifacts` / `tasks` / `work_edges` của A | Tenant B (`3ef5ab49…`, user `671df962…`) | 0 dòng cho cả 5 bảng |
| `create_task` vào workspace của A | Tenant B | Bị chặn — không có dòng nào được tạo (`intruder_tasks = 0`) |
| `link_work_entities` lên tài liệu của A | Tenant B | Bị chặn — chỉ còn đúng 1 edge do A tạo |

Kết luận: tạo việc thật từ tài liệu Word, liên kết Work Graph và cách ly tổ chức đều đạt.


## 19. Fixture Word thật — chạy hết luồng (PASS 3/3)

Fixture sinh bằng `docx-js` (không dùng engine của UNIWORK) tại `fixtures/docx/`:
`hop-dong-dich-vu.docx`, `bao-cao-thang.docx`, `bao-gia-trien-khai.docx` — đều có heading, bullet list, bảng và tiếng Việt có dấu.

Script: `scripts/docx-fixtures-generate.ts`, `scripts/docx-fixtures-roundtrip.ts`.

Luồng chạy thật mỗi fixture: nhập → parse anchored blocks → 1 sửa tay + 1 đề xuất AI (Lovable AI Gateway, model `openai/gpt-5.6-sol`) → chấp nhận → GenOffice patch theo neo → kiểm tra OOXML → xuất tệp tải xuống.

| Fixture | Blocks | Sửa được | Vá | Chỉ `word/document.xml` đổi | Preservation | Kết quả |
| --- | --- | --- | --- | --- | --- | --- |
| Hợp đồng | 11 | 10 | 2 | có | 93.8% | PASS |
| Báo cáo | 10 | 9 | 2 | có | 93.8% | PASS |
| Báo giá | 9 | 8 | 2 | có | 93.8% | PASS |

Mọi fixture đều đạt: mở được, không thiếu part bắt buộc, nội dung mới có/nội dung cũ mất, không thêm/xoá part, số bảng giữ nguyên, số block ổn định, SHA-256 bản gốc không đổi. Neo sai vẫn bị chặn bằng `PATCH_UNSAFE`.

Kiểm chứng độc lập: `pandoc` đọc cả 3 tệp đầu ra, tiếng Việt và cấu trúc còn nguyên.
