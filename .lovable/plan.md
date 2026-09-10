# AI Brain & Super Agent — Kế hoạch chi tiết

Mục tiêu: gom những gì AI trong UniWork đã làm được vào **một màn hình duy nhất**, để người dùng thấy rõ: AI đang làm gì, được phép làm gì, và đang đề xuất gì cần duyệt.

Không tạo hệ thống AI thứ hai. Không đổi kiến trúc, không đổi quyền, không cho AI tự thực thi.

## 1. Hai màn hình

### `/ai-brain` — Tổng quan (Trung tâm điều hành AI)

Bố cục 3 khu, dùng Cloud White + card modular như phần còn lại của app:

- **Dải chỉ số trên cùng**: số đề xuất đang chờ duyệt, số đã duyệt trong tuần, số bị từ chối, tỉ lệ chấp nhận, chi phí AI tuần này.
- **Cột trái — Việc AI đang đề xuất**: danh sách đề xuất thật (từ lớp hành động AI hiện có), mỗi thẻ hiện: AI nào đề xuất, dựa trên dữ liệu nào, sẽ tạo ra gì, mức rủi ro. Hai nút: Duyệt / Bỏ qua. Bấm vào xem toàn bộ nội dung trước khi duyệt.
- **Cột phải — Đội ngũ AI**: 8 hồ sơ nhân sự AI đã có, mỗi hồ sơ hiện trạng thái bật/tắt, kỹ năng đang mở, số việc đã làm tuần này.
- **Dải dưới — Nhật ký**: 20 hoạt động AI gần nhất (đề xuất, được duyệt, bị từ chối, đã thực thi), có bộ lọc theo hồ sơ AI và theo trạng thái.

### `/ai-brain/skills` — Bật tắt kỹ năng

Bảng kỹ năng theo nhóm (Công việc, Tài liệu, Họp, Email, Tri thức). Mỗi dòng:

| Kỹ năng | Mô tả ngắn | Mức rủi ro | Ai được dùng | Bật/Tắt |

- Công tắc bật/tắt ghi thẳng vào danh sách kỹ năng được phép hiện tại (`setAiSkillEnabled`) — không tạo bảng quyền mới.
- Kỹ năng rủi ro cao (gửi email ra ngoài, xóa dữ liệu, chia sẻ tài liệu) luôn hiện nhãn đỏ "Bắt buộc người duyệt" và không thể chuyển sang tự động.
- Chỉ quản trị tổ chức mới đổi được; thành viên thường chỉ xem.

## 2. Ví dụ đề xuất thực tế (nội dung mẫu hiển thị khi chưa có dữ liệu)

Ba ví dụ này lấy từ luồng đã chạy được trong hệ thống, dùng làm trạng thái rỗng có hướng dẫn:

1. **Từ biên bản họp → công việc**
   "Cuộc họp *Kickoff dự án Alpha* nêu 4 việc cần làm. Đề xuất tạo 4 công việc, giao cho Minh, Lan, hạn 15/09."
   Duyệt → tạo công việc thật, tự gắn liên kết về cuộc họp gốc.

2. **Từ tài liệu Word vừa nhập → cập nhật kết quả công việc**
   "Hợp đồng ABC v3 khác v2 ở 6 đoạn (giá, thời hạn thanh toán). Đề xuất tạo phiên bản mới và gửi duyệt cho Trưởng phòng."
   Duyệt → tạo phiên bản, giữ nguyên bản gốc, ghi lại ai duyệt.

3. **Từ công việc quá hạn → nhắc và đề xuất xử lý**
   "3 công việc quá hạn quá 5 ngày trong dự án Beta. Đề xuất gia hạn 1 tuần và thông báo người phụ trách."
   Duyệt → cập nhật hạn, gửi thông báo trong ứng dụng.

Mỗi thẻ đề xuất đều hiện đủ: *nguồn dữ liệu → việc sẽ tạo → ai chịu trách nhiệm*, để người duyệt không phải đoán.

## 3. Ranh giới

- AI **không bao giờ** tự thực hiện: mọi thay đổi đều qua bước người duyệt sẵn có.
- Không thêm bảng dữ liệu mới, không đổi phân quyền, không đổi cách đăng nhập, dữ liệu vẫn tách riêng theo tổ chức.
- Không đổi các màn hình hiện có; chỉ thêm 2 màn hình mới và một mục menu trong nhóm "AI & Tự động hóa".

## 4. Chi tiết kỹ thuật

- Route mới: `src/routes/_authenticated/ai-brain.tsx` và `ai-brain.skills.tsx` (parent render `<Outlet />`).
- Tái sử dụng nguyên trạng: `listAiActionProposals`, `confirmAiAction`, `cancelAiAction`, `refreshAiActionProposal` (`src/lib/api/ai-actions.functions.ts`); `listAiSkills`, `setAiSkillEnabled` (`src/lib/api/ai-skills.functions.ts`); hồ sơ AI từ `/ai-workforce`.
- Một server function mới duy nhất `getAiBrainOverview` (đọc-only) tổng hợp chỉ số + nhật ký từ bảng hiện có; không migration.
- Dữ liệu qua TanStack Query: loader `ensureQueryData` + `useSuspenseQuery`.
- i18n: thêm khóa vào `src/lib/i18n.tsx` (vi/en trước, các ngôn ngữ khác kế thừa fallback). Không hardcode chuỗi.
- Menu: thêm mục "Bộ não AI" vào nhóm AI & Tự động hóa trong `src/config/navigation.ts`.
- Responsive: 3 cột desktop → 1 cột dọc ở mobile, nút tối thiểu 44px.

## 5. Nghiệm thu

- Duyệt một đề xuất thật tạo ra bản ghi thật, có ghi vết ai duyệt.
- Tắt một kỹ năng thì đề xuất thuộc kỹ năng đó ngừng xuất hiện.
- Tài khoản không phải quản trị không đổi được công tắc.
- Tổ chức B không thấy đề xuất hay nhật ký của tổ chức A.
- Không lỗi tràn ngang ở 390px; kiểm tra kiểu và định dạng mã pass.
