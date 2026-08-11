CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'Sản phẩm',
  title text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  author_name text NOT NULL DEFAULT '',
  author_seed text NOT NULL DEFAULT '',
  read_time text NOT NULL DEFAULT '',
  cover_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  is_featured boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT ALL ON public.blog_posts TO service_role;

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY blog_posts_read_anon ON public.blog_posts
  FOR SELECT TO anon USING (status = 'published');
CREATE POLICY blog_posts_read_auth ON public.blog_posts
  FOR SELECT TO authenticated USING (status = 'published' OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY blog_posts_write_admin ON public.blog_posts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_blog_posts_status_published ON public.blog_posts (status, published_at DESC);

CREATE TRIGGER trg_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.blog_posts (slug, category, title, excerpt, content, author_name, author_seed, read_time, status, is_featured, published_at) VALUES
('ra-mat-uniwork-meeting-copilot','Sản phẩm','Ra mắt UNIWORK Meeting Copilot — biên bản tự động bằng tiếng Việt','Meeting Copilot ghi nhận, tóm tắt và sinh action items theo thời gian thực, hiểu sâu ngữ cảnh tiếng Việt từ giọng nói tự nhiên.','Meeting Copilot là trợ lý họp được huấn luyện riêng cho tiếng Việt. Trong suốt cuộc họp, hệ thống ghi nhận lời thoại theo từng người nói, tự động phân đoạn theo chủ đề và sinh biên bản ngay khi cuộc họp kết thúc.

Sau cuộc họp, Copilot đề xuất danh sách hành động kèm người phụ trách và hạn hoàn thành, cho phép tạo nhiệm vụ chỉ bằng một cú nhấp. Toàn bộ dữ liệu được lưu trong workspace của tổ chức và tuân thủ cơ chế cô lập dữ liệu đa tổ chức của UNIWORK.','Trần Quang Minh','quang-minh','5 phút đọc','published',true,'2026-06-08T09:00:00Z'),
('huong-dan-su-dung-ai-copilot','Hướng dẫn','Hướng dẫn sử dụng AI Copilot hiệu quả trong UNIWORK','5 mẹo giúp đội ngũ của bạn tận dụng AI Copilot để soạn tài liệu, tóm tắt meeting và tự động hoá báo cáo.','AI Copilot hoạt động tốt nhất khi bạn cung cấp đủ ngữ cảnh. Hãy bắt đầu bằng việc chọn không gian làm việc và tài liệu liên quan trước khi đặt câu hỏi.

Năm mẹo thực tế: (1) mô tả rõ định dạng đầu ra mong muốn; (2) đính kèm tài liệu nguồn thay vì dán lại nội dung; (3) yêu cầu Copilot nêu giả định; (4) chia nhỏ yêu cầu phức tạp thành các bước; (5) lưu prompt hiệu quả thành mẫu dùng lại cho cả nhóm.','Nguyễn Minh Anh','minh-anh','8 phút đọc','published',false,'2026-06-02T09:00:00Z'),
('case-study-xyz-tang-30-nang-suat','Case study','Công ty XYZ tăng 30% năng suất sau 3 tháng triển khai UNIWORK','Câu chuyện chuyển đổi số của một doanh nghiệp 200 nhân sự — từ email và Excel sang một nền tảng duy nhất.','Trước khi triển khai, XYZ vận hành trên email, bảng tính và ba công cụ chat khác nhau. Thông tin phân mảnh khiến mỗi quyết định phải chờ trung bình hai ngày.

Sau ba tháng dùng UNIWORK, toàn bộ nhiệm vụ, tài liệu và cuộc họp được gom về một nơi. Thời gian tìm kiếm thông tin giảm 62%, số cuộc họp giảm 40%, và năng suất tổng thể tăng khoảng 30% theo khảo sát nội bộ.','Trần Thu Hương','huong-tran','6 phút đọc','published',false,'2026-05-28T09:00:00Z'),
('tao-workflow-tu-dong-hoa','Hướng dẫn','Tạo workflow tự động hoá phê duyệt trong 10 phút','Hướng dẫn từng bước thiết lập quy trình phê duyệt nghỉ phép, hợp đồng và đề xuất chi phí bằng workflow builder.','Workflow builder cho phép bạn kéo thả các bước phê duyệt, điều kiện rẽ nhánh và hành động tự động.

Bắt đầu bằng mẫu "Phê duyệt nghỉ phép": chọn trigger là biểu mẫu gửi lên, thêm bước phê duyệt của quản lý trực tiếp, thêm điều kiện nếu số ngày lớn hơn năm thì chuyển tiếp cho giám đốc, và kết thúc bằng thông báo tới người gửi. Chạy thử ở chế độ mô phỏng trước khi xuất bản.','Lê Tuấn Nam','tuan-nam-ba','7 phút đọc','published',false,'2026-05-20T09:00:00Z'),
('best-practice-meeting','Văn hoá','5 best practice để mỗi cuộc họp đều có giá trị','Meeting không cần dài. Bài viết tổng hợp những nguyên tắc giúp đội ngũ chúng tôi cắt giảm 40% thời gian họp.','Một cuộc họp tốt bắt đầu từ agenda rõ ràng gửi trước ít nhất một ngày. Nếu không viết được agenda, có lẽ bạn chưa cần cuộc họp đó.

Năm nguyên tắc: giới hạn 25 hoặc 50 phút; chỉ mời người thực sự ra quyết định; ghi biên bản trực tiếp trong lúc họp; kết thúc bằng danh sách hành động có người phụ trách; và huỷ họp định kỳ khi không còn mục tiêu.','Nguyễn Minh Anh','minh-anh','4 phút đọc','published',false,'2026-05-12T09:00:00Z'),
('kien-truc-da-ten-ant-uniwork','Sản phẩm','Kiến trúc multi-tenant của UNIWORK — bảo mật từ tầng dữ liệu','Một bài viết kỹ thuật về cách UNIWORK cô lập dữ liệu giữa các tổ chức và đảm bảo bảo mật theo chuẩn ISO 27001.','Mọi bảng dữ liệu nghiệp vụ trong UNIWORK đều gắn với một tổ chức và được bảo vệ bằng chính sách bảo mật ở tầng dữ liệu. Ứng dụng không thể vô tình đọc chéo dữ liệu giữa các tổ chức, kể cả khi có lỗi ở tầng giao diện.

Bên cạnh đó, mọi hành động quan trọng đều ghi nhật ký kiểm toán, khoá mã hoá được quản lý tách biệt, và quyền hạn được kiểm tra lại ở phía máy chủ trong từng lệnh gọi.','Lê Tuấn Nam','tuan-nam-ba','10 phút đọc','published',false,'2026-05-05T09:00:00Z'),
('van-hoa-remote-tai-uniwork','Văn hoá','Văn hoá làm việc từ xa tại UNIWORK','Cách chúng tôi giữ cho 60 thành viên ở 3 thành phố luôn đồng bộ, gắn kết và làm việc hiệu quả.','Chúng tôi ưu tiên giao tiếp bất đồng bộ: mọi quyết định đều được viết lại thành tài liệu để người ở múi giờ khác đọc được.

Mỗi tuần có một buổi gặp toàn công ty 30 phút, mỗi quý có một tuần gặp mặt trực tiếp. Phần còn lại vận hành bằng tài liệu, nhiệm vụ và kênh chat theo chủ đề.','Trần Quang Minh','quang-minh','5 phút đọc','published',false,'2026-04-28T09:00:00Z');

INSERT INTO public.knowledge_articles (tenant_id, slug, title, summary, content, category, tags, status, published_at) VALUES
('64028bca-b1ad-4870-8607-ecdf5f4663a9','thiet-lap-workspace-dau-tien','Thiết lập workspace đầu tiên trong 5 phút','Tạo workspace, mời thành viên, cấu hình thông tin tổ chức và logo.','Vào mục Workspace, chọn Tạo mới, đặt tên và đường dẫn. Sau đó mời thành viên bằng email và phân vai trò phù hợp. Cuối cùng cập nhật logo và thông tin tổ chức trong Cài đặt.','start','{"popular","Cơ bản","5 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','tour-nhanh-giao-dien','Tour nhanh giao diện UNIWORK','Khám phá Dashboard, sidebar, topbar và trợ lý AI tích hợp.','Dashboard tổng hợp nhiệm vụ, cuộc họp và hoạt động gần đây. Thanh bên chứa các không gian làm việc, thanh trên cùng có tìm kiếm toàn cục và thông báo. Trợ lý AI luôn sẵn sàng ở góc phải.','start','{"popular","Cơ bản","3 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','tao-kenh-chat-va-quyen','Tạo kênh chat và quản lý quyền truy cập','Kênh công khai, kênh riêng tư, kênh khách và quy ước đặt tên.','Kênh công khai cho phép mọi thành viên tham gia; kênh riêng tư chỉ hiển thị với người được mời. Nên đặt tên theo mẫu phòng-ban-chủ-đề để dễ tìm.','chat','{"Cơ bản","6 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','lich-va-ghi-am-cuoc-hop','Lên lịch và ghi âm cuộc họp với AI tóm tắt','Tích hợp lịch, ghi âm tự động, sinh biên bản và hành động sau họp.','Tạo cuộc họp từ trang Lịch hoặc Meetings, bật tuỳ chọn ghi hình. Sau khi kết thúc, biên bản và danh sách hành động được sinh tự động.','meeting','{"popular","Nâng cao","8 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','phan-cong-nhiem-vu-sprint','Phân công nhiệm vụ và theo dõi tiến độ Sprint','Tạo task, sub-task, deadline, ưu tiên và bảng Kanban theo nhóm.','Tạo nhiệm vụ với người phụ trách, hạn hoàn thành và mức ưu tiên. Dùng bảng Kanban để theo dõi trạng thái và phát hiện điểm nghẽn.','tasks','{"Cơ bản","7 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','cong-tac-tai-lieu-thoi-gian-thuc','Cộng tác tài liệu thời gian thực','Co-editing, bình luận, lịch sử phiên bản và chia sẻ liên kết an toàn.','Nhiều người có thể chỉnh sửa cùng lúc. Mọi thay đổi được lưu thành phiên bản, có thể khôi phục bất cứ lúc nào.','documents','{"Cơ bản","5 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','thiet-ke-quy-trinh-nghi-phep','Thiết kế quy trình phê duyệt nghỉ phép','Mẫu sẵn có cho HR, điều kiện rẽ nhánh và thông báo đa kênh.','Chọn mẫu quy trình nghỉ phép, tuỳ chỉnh các bước phê duyệt và điều kiện rẽ nhánh, sau đó xuất bản để bắt đầu nhận yêu cầu.','workflow','{"Nâng cao","10 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','quan-ly-vai-tro-va-phan-quyen','Quản lý vai trò, nhóm và phân quyền chi tiết','RBAC, nhóm động theo phòng ban và kiểm toán hành động người dùng.','Phân quyền dựa trên vai trò trong tổ chức. Mọi thay đổi quyền đều được ghi nhật ký kiểm toán.','admin','{"Nâng cao","9 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','bat-xac-thuc-hai-lop','Bật xác thực 2 lớp (2FA) và SSO','TOTP, khóa bảo mật phần cứng, SAML SSO với Google/Microsoft.','Vào Cài đặt bảo mật để bật xác thực hai lớp. Tổ chức có thể bắt buộc SSO cho toàn bộ thành viên.','security','{"popular","Cơ bản","4 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','khoi-phuc-mat-khau-va-phien','Khôi phục mật khẩu và quản lý phiên đăng nhập','Đặt lại mật khẩu, đăng xuất từ xa và cảnh báo đăng nhập bất thường.','Bạn có thể đặt lại mật khẩu qua email và đăng xuất khỏi tất cả thiết bị trong phần Bảo mật của hồ sơ.','security','{"Cơ bản","3 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','tich-hop-mattermost-slack','Tích hợp Mattermost & Slack qua bridge','Đồng bộ kênh, danh bạ và lịch sử tin nhắn hai chiều.','Kết nối qua bridge để đồng bộ kênh và tin nhắn hai chiều, phù hợp giai đoạn chuyển đổi công cụ.','chat','{"Nâng cao","6 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','tu-dong-nhac-deadline-bang-ai','Tự động hoá nhắc deadline bằng AI','Nhắc thông minh dựa trên độ ưu tiên, lịch và mức tải công việc.','Trợ lý AI theo dõi hạn hoàn thành và gửi nhắc nhở vào thời điểm phù hợp với lịch làm việc của từng người.','tasks','{"Nâng cao","5 phút đọc"}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','faq-doi-ten-workspace','Tôi có thể đổi tên workspace sau khi tạo không?','Có thể đổi tên hiển thị bất cứ lúc nào.','Có. Vào Cài đặt → Workspace → Tên hiển thị. Đường dẫn (slug) chỉ đổi được bởi chủ sở hữu và sẽ cập nhật tất cả liên kết chia sẻ tự động.','faq','{}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','faq-ung-dung-desktop-mobile','UNIWORK có phiên bản desktop và mobile không?','Có ứng dụng Desktop và Mobile.','Có ứng dụng Desktop cho Windows/macOS/Linux và Mobile iOS/Android. Tải tại trang Ứng dụng & API hoặc đồng bộ qua MDM cho doanh nghiệp.','faq','{}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','faq-luu-tru-du-lieu','Dữ liệu của tôi được lưu trữ ở đâu?','Mặc định lưu tại Việt Nam, có thể chọn vùng khác.','Mặc định lưu trên cụm máy chủ Việt Nam (Hà Nội & TP.HCM) đạt chuẩn ISO 27001. Doanh nghiệp có thể chọn vùng EU/SG hoặc triển khai On-Premise.','faq','{}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','faq-gioi-han-dung-luong','Có giới hạn dung lượng tài liệu không?','Tuỳ theo gói dịch vụ.','Gói Pro 100GB/người, Business 1TB/người, Enterprise không giới hạn. Tệp đính kèm tối đa 5GB cho mỗi lần tải lên.','faq','{}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','faq-xuat-du-lieu','Làm sao xuất dữ liệu khi rời khỏi UNIWORK?','Hỗ trợ xuất toàn bộ dữ liệu.','Hỗ trợ xuất toàn bộ dữ liệu (chat, tài liệu, nhiệm vụ) ở định dạng JSON/CSV/Markdown qua Cài đặt → Dữ liệu → Xuất.','faq','{}','published',now()),
('64028bca-b1ad-4870-8607-ecdf5f4663a9','faq-ai-hoc-du-lieu-noi-bo','Trợ lý AI có học từ dữ liệu nội bộ không?','Không huấn luyện mô hình nền từ dữ liệu của bạn.','Trợ lý AI hoạt động theo cơ chế RAG trên dữ liệu workspace của bạn, không huấn luyện mô hình nền và không chia sẻ ngữ cảnh giữa các tổ chức.','faq','{}','published',now());