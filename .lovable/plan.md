# PWA UNIWORK — Native AI Work Operating System

## Quyết định sản phẩm đã khóa

PWA không triển khai thành tập hợp tám màn tĩnh và không biến Home thành dashboard AI. Toàn bộ trải nghiệm dùng một interaction model thống nhất:

```text
Drawer → Composer → Context → Conversation / Execution Stream → Review → Work Product → Work Graph
```

Người dùng không cần hiểu cấu trúc module. Họ mở UNIWORK, nói điều muốn hoàn thành, bổ sung ngữ cảnh, quan sát Human + AI thực thi, duyệt kết quả và nhận Work Product.

**Định vị UX:** `Tell UniWork what you want done.`

**Interaction canon:**

```text
Open → Ask → Add Context → Execute → Observe → Approve → Receive Work Product → Remember
```

### Ba nguyên tắc bất biến
1. **Conversation không phải sản phẩm cuối.** Chat là giao diện điều khiển; đích đến có thể là action, decision hoặc Work Product.
2. **AI Agent không phải app.** AI Workforce thuộc orchestration layer; UNIWORK chọn Human/Agent phù hợp và chỉ expose execution khi cần quan sát hoặc can thiệp.
3. **Work Graph là memory layer.** Composer truy cập ngữ cảnh công việc có quyền hạn gồm people, email, meeting, task, decision, document, execution và Work Product; `+ → Add Context → From UniWork` là interaction cốt lõi.

### Những gì không được quay lại
- Không bottom tabs.
- Không dashboard card hoặc module shortcuts trên Home.
- Không agent picker trước khi giao mục tiêu.
- Không coi Chat/My AI là một module ngang hàng với các module nghiệp vụ.
- Không để routing duy trì tư duy module sau khi UI đã chuyển sang Native AI.

## Đánh giá hiện trạng

### Có thể tái sử dụng
- Nền PWA: manifest, icon, cài lên máy, service worker, offline read-only, push notification và safe area.
- Các route mobile, tìm kiếm, dữ liệu Tasks, Meetings, Email, Documents, Work Products và AI Workers.
- UNI Copilot hiện có: conversation, nguồn trích dẫn, freshness, Context Ranker và đề xuất hành động cần xác nhận.
- AI consumer contract, Work Graph Context, execution và Work Product lifecycle hiện có.
- Work Product mobile đã có bản chi tiết, phiên bản, liên kết nguồn, Open và Share.

### Cần thay đổi
- Mobile shell hiện dùng topbar nhiều control và bottom navigation; không đúng Native AI model.
- Home hiện là dashboard danh sách họp/việc/thông báo; phải hợp nhất với My AI.
- My Box đang chia theo loại card; phải chuyển thành Inbox theo trạng thái hành động.
- AI Team đang được trình bày như destination; phải trở thành execution layer do UNI tự orchestration.
- Composer chưa là primitive xuyên suốt và dấu `+` chưa phải Add Context.
- Conversation hiện thiên về prompt → answer; cần mở rộng thành execution stream kết thúc bằng Work Product.
- Một số màn mobile còn đọc/ghi bảng nghiệp vụ trực tiếp; implementation phải đi qua SDK/server function/RPC hiện có.

## Mô hình giao diện đích

### App Shell
- Không bottom navigation.
- Header tối giản: `☰  UNIWORK  New` theo đúng cấu trúc ảnh; nút New tạo conversation/work mới.
- Hamburger mở drawer toàn chiều cao.
- Composer AI neo dưới cùng trên mọi surface phù hợp, nằm trên safe area và bàn phím.
- Nội dung giữa header và composer là conversation, execution stream hoặc object detail.

### Home / My AI hợp nhất
- Route canon là `/m`: một root conversation surface duy nhất.
- Conversation có URL `/m/c/:id` để mở lại, chia sẻ nội bộ và giữ lịch sử.
- `/m/home` và `/m/ai` là URL tương thích cũ, redirect vào `/m` hoặc conversation tương ứng; không còn là hai khái niệm sản phẩm.
- Trạng thái chưa có conversation:
  - Lời chào cá nhân theo thời điểm.
  - Bốn contextual starters: **Plan my day · Catch me up · Prepare me · Create something**.
  - Composer: **Ask, plan, create, delegate…**
- Khi người dùng gửi yêu cầu hoặc chọn starter:
  - Bốn card biến mất.
  - Màn hình chuyển thành conversation/execution stream.
  - Mỗi bước hiển thị ngữ cảnh đã dùng, ai đang thực hiện, tiến độ, checkpoint cần người duyệt và kết quả.
- Không tạo route/module AI riêng chỉ để chọn agent trước khi ra lệnh.

### Drawer
Thứ tự cuối cùng:

1. **New work**
2. **Search**
3. **My AI**
4. **INBOX**
   - Needs attention
   - Working
   - In review
5. **WORKSPACES**
6. **LIBRARY**
   - Work Products
   - Meetings
   - Email
   - Documents
7. Profile / Settings

Chat không còn là destination chính trên mobile; conversation chính là My AI. Các cuộc trao đổi đội nhóm vẫn là nguồn/ngữ cảnh và có thể truy cập từ Search hoặc workspace phù hợp.

### Composer và Add Context
- Composer là interaction primitive chính: nhập chữ, voice, gửi và trạng thái đang thực thi.
- Dấu `+` chỉ mở **Add Context**, tuyệt đối không thành menu Create Task / Create Meeting / Create Doc.
- Bottom sheet Add Context gồm:
  - Photos & Files
  - Camera
  - From UniWork
  - People & AI
  - Connect apps
- Context đã chọn hiển thị thành chip có thể xem và gỡ trước khi gửi.
- Context từ UNIWORK phải qua quyền tenant/workspace; file ngoài phải có trạng thái tải lên và lỗi rõ ràng.

### Inbox thay My Box
- Một activity model duy nhất, không bắt người dùng phân biệt email/task/agent/work product.
- Ba trạng thái:
  - **Needs attention:** cần trả lời, xác nhận, xử lý hoặc đang bị chặn.
  - **Working:** Human hoặc AI đang thực hiện.
  - **In review:** kết quả đang chờ người dùng/người có quyền duyệt.
- Mỗi item trả lời được: việc gì đang xảy ra, ai đang làm, cần hành động nào, hạn khi nào và kết quả sẽ đi đâu.
- Nguồn gốc (Email, Task, Meeting, Agent, Work Product) là metadata phụ, không phải cấu trúc điều hướng chính.

### AI Team là execution layer
- UNI tự orchestration Research / Data / Content / các agent phù hợp từ ý định và context.
- Chỉ expose agent khi có giá trị quan sát: `Research Agent · Working · 42%`.
- Stream thể hiện Human + AI steps, dependency, progress, blocker và checkpoint duyệt.
- Người dùng có thể mở chi tiết agent từ execution, nhưng không phải chọn agent trước khi ra lệnh.

### Work Product là first-class object
- Execution không kết thúc ở câu trả lời nếu yêu cầu cần đầu ra bền vững.
- Các loại đích: Report, Proposal, Presentation, Spreadsheet, Decision, Plan và loại hiện có.
- Luồng lõi:

```text
Intent → Context → Execution → Review → Work Product → Work Graph
```

- Work Product detail dùng Preview / Insights / Sources / Activity; có version, provenance, review state và liên kết Work Graph.
- Conversation giữ liên kết tới Work Product; Work Product không bị chôn trong chat history.

## Kế hoạch triển khai

### Đợt 0 — Khóa contract và quyền triển khai
- Xác nhận batch PWA/UI được phê duyệt vì Blueprint hiện ghi Giai đoạn 0 cấm thêm/chỉnh UI.
- Chốt activity contract cho Inbox và execution event contract bằng cách tái sử dụng nguồn hiện có; không tạo writer song song.
- Lập mapping route cũ → interaction model mới để giữ deep link và không làm mất chức năng.
- Khóa URL contract `/m` và `/m/c/:id`; xác định redirect vĩnh viễn cho `/m/home`, `/m/ai` và hành vi mở shortcut PWA.

**Nghiệm thu:** không xung đột Blueprint; không schema mới ngoài batch duyệt; mọi command quan trọng vẫn qua trusted boundary.

### Đợt 1 — Native AI shell và conversation home
- Bỏ bottom navigation khỏi mobile shell.
- Tạo header `☰ UNIWORK New`, drawer đúng thứ tự đã khóa và composer cố định.
- Tạo route canon `/m` và `/m/c/:id`; chuyển nội dung Home/My AI vào root surface rồi redirect URL cũ.
- Trạng thái rỗng có lời chào + bốn starter; khi bắt đầu conversation, starter biến mất.
- Thêm Add Context bottom sheet đủ 5 nguồn ngay trong đợt này.
- Dùng lại UNI Copilot conversation engine thay vì tạo chatbot thứ hai.

**Nghiệm thu:** mở app → nhập yêu cầu hoặc chọn starter → stream xuất hiện; drawer/composer hoạt động ở 390, 440 và 820px; bàn phím không che ô nhập; mọi hit area ≥44px.

**Nghiệm thu URL:** mở trực tiếp hoặc refresh `/m/c/:id` giữ đúng conversation; `/m/home` và `/m/ai` không tạo surface riêng; shortcut PWA mở `/m`.

### Đợt 2 — Context và conversation stream
- Context chips, xem trước, gỡ, upload progress và permission errors.
- “From UniWork” tìm Tasks, Meetings, Email, Documents, Decisions và Work Products qua Universal Search/Context Engine.
- Chuẩn hóa message rendering, nguồn, freshness, thinking/execution states và retry.
- Voice entry nối vào cùng composer; transcript phải được xem lại trước action có mutation.

**Nghiệm thu:** câu hỏi có context thật, nguồn và độ tươi; context không rò tenant; offline không cho mutation ngầm.

### Đợt 3 — Contextual starters thành workflows
- **Plan my day:** timeline, ưu tiên và attention items từ dữ liệu thật.
- **Catch me up:** thay đổi theo thời gian ở email/họp/task/project/people/agents; quyết định đã xác nhận ưu tiên trước task.
- **Prepare me:** meeting briefing gồm Overview / Context / People / Files từ transcript, summary, decisions và linked entities.
- **Create something:** execution có bước thật và kết thúc bằng Work Product phù hợp.
- Các starter chỉ là entry prompt/workflow; kết quả vẫn nằm trong cùng stream, không tạo bốn mini-app rời.

**Nghiệm thu:** mỗi starter tạo đúng stream, dẫn nguồn, không bịa dữ liệu thiếu và không tạo trùng khi retry.

### Đợt 4 — Inbox theo activity state
- Thay My Box bằng Inbox ba trạng thái Needs attention / Working / In review.
- Xây projection/read model hợp nhất từ nguồn hiện có; không chuyển ownership và không dual-write.
- Hành động nhanh theo capability: trả lời, xác nhận, mở blocker, duyệt, yêu cầu sửa.
- Badge drawer dùng số activity cần chú ý thật.

**Nghiệm thu:** cùng một model hiển thị email cần trả lời, task cần duyệt, AI execution đang chạy và Work Product chờ review; action tuân quyền và idempotency.

### Đợt 5 — Execution orchestration UX
- Hiển thị Human + AI execution theo step, agent, dependency, phần trăm và checkpoint.
- Agent tự được chọn phía orchestration; UI chỉ expose khi đang tham gia hoặc cần giải thích.
- Hỗ trợ cancel/retry/approve ở các điểm backend cho phép; không dựng progress giả.
- Stream có thể thu gọn thành activity trong Working và mở lại đúng trạng thái.

**Nghiệm thu:** người dùng quan sát được ai đang làm gì, phần nào chờ mình và retry không tạo execution/Work Product trùng.

### Đợt 6 — Work Product first-class
- Hoàn thiện detail: Preview / Insights / Sources / Activity.
- Review checkpoint chuyển rõ từ execution sang In review rồi thành Work Product đã duyệt.
- Hiển thị version, provenance, người/agent tạo, nguồn context và Work Graph links.
- Conversation có artifact card bền vững, mở thẳng object; drawer Library có Work Products.

**Nghiệm thu:** Report/Proposal/Presentation/Spreadsheet/Decision/Plan mở đúng object, có lịch sử và nguồn; conversation không phải nơi duy nhất giữ kết quả.

### Đợt 7 — PWA hardening và nghiệm thu thiết bị thật
- Kiểm tra install, cold start, update, push, offline read-only và quay lại online trên bản phát hành.
- Kiểm thử dark/light, vi/en, reduced motion, iOS/Android keyboard, camera/micro/file picker.
- Kiểm tra 390×844, 440×956 và 820px; không overflow hoặc occlusion.
- Chạy typecheck, architecture/domain gates, AI context/action tests và Playwright journeys.

## Hướng kỹ thuật

```text
Mobile Native AI Shell
├── Drawer
├── Conversation / Execution Stream
├── Context Composer
│   └── Add Context Sheet
├── Unified Inbox Read Model
└── Work Product Surfaces

Existing trusted layer
├── AI Consumer Contract
├── Context Engine + Ranker + Freshness
├── AI Action Proposal / Approval
├── Execution + Human checkpoints
├── Work Product lifecycle
└── Work Graph projection
```

- Không tạo AI pipeline mới song song với UNI Copilot.
- Không direct-write domain tables từ component; thay các điểm mobile hiện có bằng SDK/server functions/RPC.
- Không hard-code UI text; mọi chuỗi mới qua i18n, tiếng Việt mặc định.
- Chỉ dùng semantic tokens; dark-first theo ảnh nhưng light mode vẫn đầy đủ.
- Không dùng ảnh tham chiếu làm asset; tái tạo interaction và visual language bằng component thật.

## Rủi ro cần kiểm soát

- Unified Inbox có thể cần read model mới; chỉ thực hiện sau khi chốt ownership và migration batch, không gom dữ liệu bằng dual-write.
- Progress chỉ hiển thị từ execution telemetry thật; không dùng animation giả để che thiếu backend state.
- Connect apps chỉ hiển thị connector thực sự có thể dùng; connector chưa kết nối phải có trạng thái rõ.
- Prepare me phụ thuộc transcript/summary; dữ liệu thiếu phải báo thiếu, không suy diễn.
- Voice/camera cần kiểm thử thiết bị thật và fallback nhập chữ/file.
- Xóa Chat khỏi destination mobile không có nghĩa xóa dữ liệu/chat nghiệp vụ; nó vẫn là context và có thể được mở từ Search/workspace.

## Definition of Done

> A user should be able to open UniWork, tell it what they want done, provide work context, observe Human + AI execution, review the result, and receive a Work Product—without needing to understand UniWork’s module structure.

Kèm tiêu chí bắt buộc:
- Drawer để điều hướng, Composer để yêu cầu, Context để hiểu, Stream để quan sát, Work Product để nhận kết quả.
- Không bottom navigation; `+` luôn là Add Context.
- Không overflow 390–820px; hit area ≥44px; safe area và bàn phím đúng.
- Dữ liệu thật, permission-aware, tenant-safe; không mock, direct-write hoặc dual-write.
- AI có nguồn và freshness; mutation cần xác nhận; retry idempotent.
- PWA cài đặt, cập nhật, offline read-only và push hoạt động trên bản phát hành.
- URL phản ánh đúng mô hình Native AI: một root `/m`, conversation `/m/c/:id`, URL module cũ chỉ redirect tương thích.