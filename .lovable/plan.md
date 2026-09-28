# Bước 1 — Gói Trường học (School Pack): bộ từ ngữ, mẫu văn bản, Skill bản tin

## Mục tiêu
Trường học bật "Gói Trường học" để thấy tên gọi, mẫu văn bản và Skill bản tin phù hợp với nhà trường. Doanh nghiệp không bật gói thì không thấy gì thay đổi. Không đổi phần lõi, không tạo module mới.

## 1. Bật/tắt gói theo từng tổ chức
- Trong Cài đặt tổ chức thêm mục "Loại hình": Doanh nghiệp (mặc định) / Trường học.
- Chỉ chủ sở hữu hoặc quản trị viên tổ chức được đổi. Đổi xong thì tên gọi và mẫu cập nhật ngay.
- Máy chủ quyết định gói nào đang bật, giao diện không tự quyết.

## 2. Bộ từ ngữ trường học
Đổi tên hiển thị, dữ liệu giữ nguyên:

| UniWork | Trường học |
|---|---|
| Doanh nghiệp | Trường / Hệ thống trường |
| Workspace | Cơ sở / Khối / Tổ chuyên môn / Phòng ban |
| Chủ sở hữu / Quản trị | Hiệu trưởng / Phó hiệu trưởng |
| Quản lý | Tổ trưởng / Trưởng phòng |
| Nhân viên | Giáo viên / Nhân viên |
| Cuộc họp | Họp hội đồng / Họp tổ |
| Quyết định | Chỉ đạo / Kết luận |
| Kết quả công việc | Hồ sơ / Văn bản |

- Có đủ tiếng Việt và tiếng Anh, dùng đúng hệ thống đa ngôn ngữ đang có.
- Từ nào chưa có bản trường học thì hiển thị từ gốc của UniWork.

## 3. Mẫu văn bản trường học (dùng mẫu Kết quả công việc hiện có)
8 mẫu khởi đầu:
1. Kế hoạch năm học
2. Kế hoạch tháng / tuần của trường
3. Biên bản họp hội đồng sư phạm
4. Biên bản sinh hoạt tổ chuyên môn
5. Báo cáo sơ kết / tổng kết học kỳ
6. Kế hoạch tổ chức sự kiện, ngoại khóa
7. Báo cáo sự cố (an toàn, cơ sở vật chất)
8. Phiếu giao việc / chỉ đạo của BGH

- Mẫu chỉ có khung, mục và câu gợi ý. Không có số liệu hay tên người giả.
- Chỉ trường đã bật gói mới thấy các mẫu này khi bấm "Tạo mới".

## 4. Skill "Bản tin điều hành trường học" (bản nháp)
- Lưu Skill anh gửi thành bản nháp, gồm quy tắc: chỉ đọc dữ liệu, mọi ý phải có nguồn, lọc theo quyền người xem, che thông tin cá nhân học sinh.
- Cấu trúc bản tin: Tóm tắt → Việc cần BGH quyết → Việc trễ hạn / rủi ro → Lịch hôm nay → Chỉ đạo đang theo dõi → Nguồn.
- Kèm 14 tình huống kiểm thử để Bước 2 chạy thử.
- Bước 1 chỉ soạn và lưu. Kích hoạt và chạy thật thuộc Bước 2.

## 5. Không làm trong Bước 1
- Không làm module Công văn, Sự cố khẩn, lịch gửi 7h sáng.
- Không nhập dữ liệu học sinh thật.
- Không đổi phân quyền hay cách tách dữ liệu giữa các tổ chức.

## 6. Kiểm tra trước khi bàn giao
- Tổ chức doanh nghiệp: giao diện giống hệt trước khi làm.
- Tổ chức trường học: tên gọi và mẫu đổi đúng trên màn hình 390/820/1280px.
- Nhân viên thường không bật hoặc tắt được gói.
- Bản dựng sạch, các kiểm tra kiến trúc đều qua.

## Bàn giao sang Bước 2
Công tắc gói, bộ từ ngữ, 8 mẫu văn bản, Skill nháp và 14 tình huống kiểm thử.

---

## Chi tiết kỹ thuật
- **Cờ gói:** thêm `tenant_settings.industry_pack` ('business' | 'school'), mặc định 'business'. Đây là migration bổ sung nhỏ, cần anh duyệt theo quy định Giai đoạn 0. Ghi qua RPC SECURITY DEFINER `set_tenant_industry_pack` (kiểm tra owner/admin, có audit + outbox, idempotency_key). Đọc qua server fn `getTenantPack` bằng `requireSupabaseAuth`.
- **Từ ngữ:** `src/lib/i18n-locales/packs/school.ts`, lớp phủ key i18n. Trong `t()` tra `pack:<key>` trước rồi mới về key gốc. Hook `useTenantPack()` dùng TanStack Query.
- **Mẫu văn bản:** đăng ký trong registry template của work-deliverables, có `pack: 'school'`, lọc ở `createWorkDeliverable`/`useTemplate`. Không đổi schema.
- **Skill:** `.agents/skills/school-executive-brief/SKILL.md` + `references/test-cases.md`, rồi `skills--apply_draft`.
- **Kiến trúc:** ghi vào AGENTS.md quy tắc "industry pack = lớp phủ cấu hình, không fork core".
