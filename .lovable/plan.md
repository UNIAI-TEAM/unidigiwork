# PWA UNIWORK bám sát thiết kế trợ lý công việc đã gửi

## Kết luận đánh giá

PWA hiện tại **đã có nền kỹ thuật tốt**, nhưng mới khớp khoảng **45–55% về chức năng** và **25–35% về trải nghiệm hình ảnh** so với bộ thiết kế:

### Đã có và có thể tái sử dụng
- Cài lên màn hình chính, bộ icon, chế độ độc lập, ngoại tuyến, cập nhật tự động và vùng an toàn thiết bị.
- Nhánh màn hình riêng `/m/*`, tìm kiếm, thông báo, Chat, Tasks, Meetings, Email, My AI, My Box và Work Products.
- My AI đã có Ask / Do / Brief Me / AI Team, câu trả lời có nguồn và độ tươi dữ liệu.
- Work Product đã có danh sách, chi tiết, phiên bản, liên kết công việc/tài liệu/cuộc họp, Open và Share.
- Có nền trợ lý UNI dùng chung, đề xuất hành động cần xác nhận, AI Workers và Work Graph Context.
- Hỗ trợ sáng/tối, tiếng Việt mặc định và đa ngôn ngữ.

### Lệch chính so với thiết kế
1. **Vỏ ứng dụng:** hiện dùng topbar dày và 5 tab dưới; thiết kế dùng header tối giản, menu trượt bên trái và thanh nhập AI cố định dưới.
2. **Home:** hiện là danh sách họp/việc/thông báo; thiết kế lấy trợ lý AI làm trung tâm với lời chào và 4 hành động lớn.
3. **Plan my day / Catch me up / Prepare me / Create something:** chưa có bốn trải nghiệm chuyên biệt như thiết kế; hiện mới là prompt nhanh trong My AI.
4. **Work Product:** dữ liệu đã có nhưng bố cục chưa khớp Preview / Insights / Sources / Activity và bản xem trước tài liệu lớn.
5. **Voice:** chưa có màn nghe toàn màn hình, trạng thái nghe/xử lý và điều khiển như mẫu.
6. **Điều hướng:** sidebar đầy đủ trong ảnh chưa có trên mobile; nhiều chức năng đang nằm ở More hoặc bottom tab.
7. **Ngôn ngữ giao diện:** một số chuỗi mobile còn viết trực tiếp; cần đưa toàn bộ qua hệ thống dịch.
8. **Kiến trúc dữ liệu:** một số màn mobile đang đọc/ghi bảng nghiệp vụ trực tiếp; khi triển khai phải chuyển sang luồng máy chủ/SDK hiện có, không tạo writer thứ hai.
9. **Manifest:** bản hiện tại mở từ `/welcome`, không trực tiếp `/m/home`; cần giữ luồng đúng cho cả khách và người đã đăng nhập thay vì đổi mù quáng.

## Hướng thiết kế chốt

- Bám sát bố cục, nhịp điệu, mật độ và tương tác trong ảnh; không nhúng ảnh tham chiếu vào sản phẩm.
- **Dark-first** giống mẫu: nền đen-xanh, bề mặt xám than, viền mảnh, xanh điện làm nhấn chính; vẫn hoàn thiện light mode bằng token hiện có.
- Logo chữ ở giữa header; avatar/menu trái-phải tùy màn; tiêu đề màn nằm gọn trên cùng.
- Menu hamburger mở drawer toàn chiều cao, chứa New chat, Search, My AI, Inbox, Workspaces và các module chính đúng thứ tự ảnh.
- Thanh AI composer cố định phía dưới: nút thêm, ô nhập, micro, gửi; nằm trên safe area và không che nội dung.
- Ô bấm tối thiểu 44px; không tràn ngang trong dải 390–820px; chuyển động ngắn, không nảy mạnh.
- Tiếng Việt mặc định, English qua i18n; giữ tên sản phẩm như My AI / Work Products khi phù hợp thương hiệu.

## Kế hoạch triển khai

### Đợt 1 — Vỏ PWA đúng thiết kế
- Thay bottom tab bằng header tối giản + drawer điều hướng + composer cố định phía dưới.
- Giữ mọi route hiện có; drawer chỉ thay cách truy cập, không thay quyền hay nghiệp vụ.
- Thêm avatar người dùng, badge Inbox, danh sách workspace thật và trạng thái active.
- Chuẩn hóa safe area, bàn phím ảo, chiều cao động và cuộn nội dung.
- Giữ service worker không chạy trong Preview; kiểm tra lại install/offline/push trên bản phát hành.

**Nghiệm thu:** drawer mở/đóng bằng chạm, kéo và Escape; composer không bị bàn phím che; mọi mục điều hướng tới đúng màn; không có overflow ở 390, 440 và 820px.

### Đợt 2 — Home trợ lý AI
- Header lời chào theo thời điểm và tên người dùng.
- Bốn thẻ đúng thiết kế:
  - **Lập kế hoạch ngày** — ưu tiên việc, họp và việc theo dõi.
  - **Cập nhật nhanh** — tổng hợp thay đổi kể từ lần truy cập gần nhất.
  - **Chuẩn bị cho tôi** — chọn cuộc họp sắp tới để dựng briefing.
  - **Tạo nội dung** — tạo Work Product từ cuộc họp, task hoặc yêu cầu tự do.
- Chạm thẻ mở đúng luồng riêng; composer Home dùng cùng AI consumer contract hiện có.
- Trạng thái rỗng, tải, lỗi và dữ liệu một phần phải rõ ràng, không dùng số liệu giả.

**Nghiệm thu:** cả 4 thẻ dùng dữ liệu tổ chức thật, tôn trọng quyền xem và cho kết quả có nguồn.

### Đợt 3 — Bốn luồng AI chuyên biệt

#### Plan my day
- Timeline ngày, thời lượng, lịch họp, task đến hạn và 3 việc cần chú ý.
- AI chỉ đề xuất ưu tiên; người dùng xác nhận trước mọi thay đổi task/lịch.
- Có “Xem kế hoạch đầy đủ” và mở đúng thực thể nguồn.

#### Catch me up
- Tổng hợp Email, Meetings, Tasks, Projects, People và AI Agents theo khoảng thời gian.
- Hiển thị số thay đổi, key takeaways, nguồn và độ tươi; quyết định đã xác nhận được ưu tiên trước task.
- Không suy diễn khi nguồn thiếu hoặc cũ.

#### Prepare me
- Chọn cuộc họp thật; hiển thị Overview / Context / People / Files.
- Dùng transcript, meeting summary, quyết định, action items, người tham dự và tài liệu có quyền xem.
- Nút “Xem brief đầy đủ” mở briefing hoàn chỉnh, không tạo dữ liệu mới ngoài ý muốn.

#### Create something
- Nhận yêu cầu, chọn ngữ cảnh nguồn và loại đầu ra.
- Hiển thị checklist tiến độ thật: đọc transcript, phân tích tài liệu, soạn thảo, tạo slide/file.
- Khi hoàn tất mở Work Product mới; lỗi từng bước có thể thử lại an toàn và không tạo trùng.

**Nghiệm thu:** mỗi luồng có URL riêng để back/share trong app, trạng thái tải có tiến độ thật, retry có idempotency và mọi mutation đi qua trusted boundary.

### Đợt 4 — Work Product đúng mẫu
- Header tài liệu với icon định dạng, tên, phiên bản, trạng thái Ready.
- Tabs **Preview / Insights / Sources / Activity**.
- Preview lớn đúng tỷ lệ; metadata trang, định dạng, AI-created; Open / Share / More.
- Insights đọc từ dữ liệu thật; Sources liên kết Work Graph; Activity hiển thị phiên bản và lịch sử thật.
- Composer theo ngữ cảnh “Hỏi về tài liệu này” cố định cuối màn.

**Nghiệm thu:** DOCX/PPTX/XLSX/PDF hiển thị đúng loại; nguồn và phiên bản khớp backend; thao tác Open/Share/Follow hoạt động.

### Đợt 5 — Voice theo thiết kế
- Màn toàn màn hình với trạng thái **Đang nghe / Đang xử lý / Đang trả lời / Lỗi**.
- Orb động vừa phải theo âm lượng, waveform, đóng, tạm dừng/tiếp tục và cài đặt đầu vào.
- Chuyển giọng nói thành nội dung qua luồng máy chủ hiện có; người dùng nhìn thấy transcript trước khi thực hiện hành động.
- Mọi lệnh thay đổi dữ liệu vẫn tạo đề xuất cần xác nhận; không tự gửi email, xoá hoặc chỉnh sửa.
- Có phương án nhập chữ khi trình duyệt từ chối micro; không ghi âm nền ngoài phiên chủ động.

**Nghiệm thu:** quyền micro, từ chối quyền, mất mạng, dừng giữa chừng và gửi lại đều có trạng thái rõ; không lộ âm thanh hoặc transcript sang tổ chức khác.

### Đợt 6 — Hoàn thiện PWA và kiểm thử thật
- Rà manifest, shortcut và hành vi mở app: khách → Welcome/Auth; đã đăng nhập → Home mobile.
- Kiểm tra cold start, cập nhật phiên bản, offline read-only, push notification và quay lại online.
- Kiểm thử dark/light, vi/en, 390×844, 440×956 và 820px; bàn phím iOS/Android; giảm chuyển động.
- Kiểm tra quyền theo tenant/workspace, route sâu, dữ liệu cũ, nguồn AI, độ tươi và trạng thái lỗi từng phần.
- Chạy typecheck, test AI context/action, architecture gates và Playwright các hành trình chính.

## Cấu trúc kỹ thuật dự kiến

```text
Mobile App Shell
├── Header + Navigation Drawer
├── Context-aware AI Composer
└── Mobile Routes
    ├── /m/home
    ├── /m/ai/plan
    ├── /m/ai/catch-up
    ├── /m/ai/prepare
    ├── /m/ai/create
    ├── /m/voice
    └── /m/work-products/:id

AI Consumer Contract hiện có
├── Work Graph Context + Semantic Context
├── Freshness + Context Ranker
├── Permission Filter
└── My AI / Work Product / Meeting Intelligence
```

- Không thêm bảng mới nếu các nguồn hiện tại đã đủ.
- Không đọc/ghi bảng nghiệp vụ trực tiếp từ màn mới; dùng SDK/server function/RPC hiện có.
- Không tạo AI pipeline song song; tái sử dụng consumer contract, ranker, freshness và action proposal.
- Chỉ cân nhắc migration nếu thiếu dữ liệu trạng thái thực sự cho tiến độ dài hạn; phải qua batch duyệt riêng.

## Thứ tự ưu tiên và ước lượng

1. **Shell + Home:** 1 đợt — tạo khác biệt thị giác lớn nhất và khớp hai màn đầu.
2. **Plan + Catch up:** 1 đợt — giá trị dùng hằng ngày cao nhất.
3. **Prepare + Create:** 1–2 đợt — phụ thuộc Meeting Intelligence và Work Product execution.
4. **Work Product detail:** 1 đợt — phần lớn dữ liệu đã sẵn.
5. **Voice:** 1 đợt — cần kiểm thử quyền micro trên thiết bị thật.
6. **PWA hardening:** xuyên suốt và một đợt nghiệm thu cuối.

Tổng thể: **6–7 đợt triển khai nhỏ**, mỗi đợt có thể nghiệm thu độc lập, không thay schema hoặc nghiệp vụ ngoài phạm vi đã duyệt.

## Rủi ro cần khóa trước khi triển khai

- Blueprint hiện ghi Giai đoạn 0 cấm thêm/chỉnh UI; cần xác nhận hạng mục này đã được phê duyệt như một batch UI/PWA trước khi bắt đầu code.
- “Prepare me” chỉ đầy đủ khi cuộc họp có transcript/summary thật; thiếu dữ liệu phải hiển thị rõ, không tạo nội dung giả.
- “Create something” phải dùng execution hiện có và idempotency, không tạo writer thứ hai cho Work Products.
- Offline chỉ cho xem dữ liệu đã có an toàn; không xếp hàng mutation ngầm khi mất mạng ở đợt này.
- Voice trên iOS/Android khác nhau về quyền và audio session; bắt buộc nghiệm thu trên thiết bị thật, không chỉ simulator.

## Definition of Done

- Giao diện bám sát cả 8 màn trong ảnh về cấu trúc, nhịp, typography, bề mặt, composer và trạng thái.
- Không overflow 390–820px; mọi thao tác chính ≥44px; không bị bàn phím hoặc safe area che.
- Không hard-code màu hoặc chuỗi mới; đủ vi/en, dark/light và reduced motion.
- Dữ liệu thật, permission-aware, tenant-safe; không mock, không direct-write, không dual-write.
- AI trả lời có nguồn, độ tươi; hành động cần xác nhận; tiến độ và Work Product không tạo trùng.
- Cài đặt, mở lại, cập nhật, offline read-only và push được kiểm tra trên bản phát hành.
