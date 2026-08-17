-- ============ AI MARKET: catalog toàn hệ thống ============
CREATE TABLE public.ai_market_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_]{2,60}$'),
  name text NOT NULL,
  title text NOT NULL DEFAULT '',
  domain text NOT NULL,
  worker_profile text,
  mission text NOT NULL DEFAULT '',
  persona text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  skills text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT ARRAY['vi','en']::text[],
  seniority text NOT NULL DEFAULT 'MID' CHECK (seniority IN ('JUNIOR','MID','SENIOR','LEAD')),
  currency text NOT NULL DEFAULT 'VND',
  salary_min numeric(14,2) NOT NULL DEFAULT 0,
  salary_max numeric(14,2) NOT NULL DEFAULT 0,
  fee_per_action numeric(14,2) NOT NULL DEFAULT 0,
  rating numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  hires_count integer NOT NULL DEFAULT 0,
  completed_tasks integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_market_salary_chk CHECK (salary_max >= salary_min)
);
GRANT SELECT ON public.ai_market_agents TO authenticated;
GRANT ALL ON public.ai_market_agents TO service_role;
ALTER TABLE public.ai_market_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_market_agents_select ON public.ai_market_agents FOR SELECT TO authenticated USING (published);
CREATE TRIGGER ai_market_agents_updated_at BEFORE UPDATE ON public.ai_market_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ai_market_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_agent_id uuid NOT NULL REFERENCES public.ai_market_agents(id) ON DELETE CASCADE,
  industry text NOT NULL,
  company_label text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  duration_months integer NOT NULL DEFAULT 0,
  completed_tasks integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_market_exp_agent_idx ON public.ai_market_experiences(market_agent_id, sort_order);
GRANT SELECT ON public.ai_market_experiences TO authenticated;
GRANT ALL ON public.ai_market_experiences TO service_role;
ALTER TABLE public.ai_market_experiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_market_exp_select ON public.ai_market_experiences FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_market_agents a WHERE a.id = market_agent_id AND a.published));

CREATE TABLE public.ai_market_interview_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  domain text NOT NULL,
  prompt text NOT NULL,
  rubric text NOT NULL DEFAULT '',
  max_score integer NOT NULL DEFAULT 10,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_market_interview_cases TO authenticated;
GRANT ALL ON public.ai_market_interview_cases TO service_role;
ALTER TABLE public.ai_market_interview_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_market_cases_select ON public.ai_market_interview_cases FOR SELECT TO authenticated USING (true);

-- ============ HỢP ĐỒNG NHÂN SỰ AI (tenant-scoped) ============
CREATE TABLE public.ai_employments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  market_agent_id uuid NOT NULL REFERENCES public.ai_market_agents(id),
  workflow_agent_id uuid REFERENCES public.workflow_agents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'INTERVIEW'
    CHECK (status IN ('INTERVIEW','OFFER','TRIAL','HIRED','REJECTED','TERMINATED')),
  currency text NOT NULL DEFAULT 'VND',
  salary_amount numeric(14,2) NOT NULL DEFAULT 0,
  fee_per_action numeric(14,2) NOT NULL DEFAULT 0,
  term_months integer NOT NULL DEFAULT 0,
  terms text NOT NULL DEFAULT '',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  hired_at timestamptz,
  ended_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_employments_tenant_idx ON public.ai_employments(tenant_id, status);
CREATE UNIQUE INDEX ai_employments_active_uidx
  ON public.ai_employments(tenant_id, market_agent_id)
  WHERE status IN ('INTERVIEW','OFFER','TRIAL','HIRED');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_employments TO authenticated;
GRANT ALL ON public.ai_employments TO service_role;
ALTER TABLE public.ai_employments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_employments_select ON public.ai_employments FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));
CREATE POLICY ai_employments_write ON public.ai_employments FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE TRIGGER ai_employments_updated_at BEFORE UPDATE ON public.ai_employments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ai_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  market_agent_id uuid NOT NULL REFERENCES public.ai_market_agents(id),
  employment_id uuid REFERENCES public.ai_employments(id) ON DELETE SET NULL,
  score numeric(5,2),
  max_score numeric(5,2),
  turns_used integer NOT NULL DEFAULT 0,
  max_turns integer NOT NULL DEFAULT 10,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_interviews_tenant_idx ON public.ai_interviews(tenant_id, market_agent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_interviews TO authenticated;
GRANT ALL ON public.ai_interviews TO service_role;
ALTER TABLE public.ai_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_interviews_select ON public.ai_interviews FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));
CREATE POLICY ai_interviews_write ON public.ai_interviews FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE TRIGGER ai_interviews_updated_at BEFORE UPDATE ON public.ai_interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ai_interview_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.ai_interviews(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  role text NOT NULL CHECK (role IN ('user','assistant','case')),
  content text NOT NULL DEFAULT '',
  case_id uuid REFERENCES public.ai_market_interview_cases(id) ON DELETE SET NULL,
  score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_interview_msg_idx ON public.ai_interview_messages(interview_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_interview_messages TO authenticated;
GRANT ALL ON public.ai_interview_messages TO service_role;
ALTER TABLE public.ai_interview_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_interview_msg_select ON public.ai_interview_messages FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));
CREATE POLICY ai_interview_msg_write ON public.ai_interview_messages FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

CREATE TABLE public.ai_employment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  employment_id uuid NOT NULL REFERENCES public.ai_employments(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  salary_amount numeric(14,2),
  note text NOT NULL DEFAULT '',
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_employment_events_idx ON public.ai_employment_events(employment_id, created_at DESC);
GRANT SELECT, INSERT ON public.ai_employment_events TO authenticated;
GRANT ALL ON public.ai_employment_events TO service_role;
ALTER TABLE public.ai_employment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_employment_events_select ON public.ai_employment_events FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));
CREATE POLICY ai_employment_events_insert ON public.ai_employment_events FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(tenant_id));

-- ============ SEED: ứng viên AI ============
INSERT INTO public.ai_market_agents
  (code, name, title, domain, worker_profile, mission, persona, bio, skills, seniority, salary_min, salary_max, fee_per_action, rating, hires_count, completed_tasks, sort_order)
VALUES
('MK_PROJECT_SENIOR','Minh PM','Trợ lý quản trị dự án cấp cao','Quản lý dự án','project',
 'Theo dõi tiến độ, phát hiện rủi ro trễ hạn và đề xuất việc cần làm sau mỗi cuộc họp.',
 'Bạn là trợ lý quản trị dự án: ưu tiên tiến độ, rủi ro trễ hạn và trách nhiệm rõ ràng.',
 'Đã đồng hành 40+ dự án triển khai phần mềm, mạnh về theo dõi milestone và cảnh báo sớm.',
 ARRAY['SUMMARIZE_WORK','RISK_ANALYSIS','PROPOSE_TASK','PROPOSE_TASK_UPDATE']::text[],'SENIOR',6000000,12000000,1500,4.80,128,5240,1),
('MK_PROJECT_MID','An Scrum','Trợ lý điều phối sprint','Quản lý dự án','project',
 'Điều phối sprint, nhắc việc quá hạn và tổng hợp trạng thái hằng ngày.',
 'Bạn là trợ lý quản trị dự án: ngắn gọn, bám sát sprint và cam kết của từng người.',
 'Chuyên đội phát triển 5–15 người, quen quy trình Scrum và Kanban.',
 ARRAY['SUMMARIZE_WORK','RISK_ANALYSIS','PROPOSE_TASK']::text[],'MID',3500000,7000000,1000,4.50,86,2810,2),
('MK_RESEARCH_SENIOR','Hà Analyst','Chuyên viên phân tích & nghiên cứu','Nghiên cứu & Phân tích','research',
 'Tổng hợp tài liệu, biên bản họp và tri thức nội bộ thành kết luận có trích dẫn nguồn.',
 'Bạn là chuyên viên phân tích: chỉ kết luận dựa trên nguồn đã trích dẫn, không suy đoán.',
 'Nền tảng nghiên cứu thị trường và tổng hợp tri thức nội bộ cho ban điều hành.',
 ARRAY['SUMMARIZE_WORK','MEETING_RECALL','RISK_ANALYSIS','PROPOSE_TASK']::text[],'SENIOR',5000000,10000000,1200,4.70,64,1980,3),
('MK_RESEARCH_JUNIOR','Bảo Research','Trợ lý tra cứu tri thức','Nghiên cứu & Phân tích','research',
 'Tra cứu nhanh tài liệu và biên bản, trả lời kèm nguồn.',
 'Bạn là trợ lý tra cứu: trả lời ngắn gọn, luôn kèm nguồn.',
 'Phù hợp đội nhỏ cần tra cứu tài liệu và biên bản họp hằng ngày.',
 ARRAY['SUMMARIZE_WORK','MEETING_RECALL']::text[],'JUNIOR',2000000,4000000,600,4.20,41,980,4),
('MK_SALES_SENIOR','Trâm Sales','Trợ lý kinh doanh cấp cao','Kinh doanh & CRM','sales',
 'Soạn thư theo dõi khách hàng và nhắc các cơ hội đang chững lại.',
 'Bạn là trợ lý kinh doanh: văn phong lịch sự, ngắn gọn, luôn có bước tiếp theo rõ ràng.',
 'Kinh nghiệm chăm sóc pipeline B2B, tỷ lệ phản hồi thư theo dõi cao.',
 ARRAY['SUMMARIZE_WORK','DRAFT_EMAIL','PROPOSE_TASK']::text[],'SENIOR',5500000,11000000,1400,4.60,97,3120,5),
('MK_SALES_MID','Khoa CRM','Trợ lý chăm sóc cơ hội','Kinh doanh & CRM','sales',
 'Nhắc cơ hội chưa phản hồi và soạn thư nháp chăm sóc.',
 'Bạn là trợ lý kinh doanh: bám sát cơ hội, nhắc đúng thời điểm.',
 'Quen quy trình pipeline nhiều giai đoạn, hỗ trợ đội sales 3–10 người.',
 ARRAY['DRAFT_EMAIL','PROPOSE_TASK']::text[],'MID',3000000,6000000,900,4.30,55,1440,6),
('MK_DATA_SENIOR','Duy Data','Chuyên viên phân tích dữ liệu','Dữ liệu & BI','data',
 'Phân tích khối lượng công việc và xếp ưu tiên dựa trên dữ liệu vận hành.',
 'Bạn là chuyên viên dữ liệu: nêu con số cụ thể và lý do xếp ưu tiên.',
 'Mạnh về chấm điểm rủi ro, cân tải nguồn lực và báo cáo vận hành.',
 ARRAY['RISK_ANALYSIS','WORKLOAD_TRIAGE']::text[],'SENIOR',5000000,9500000,1100,4.55,48,1620,7),
('MK_HR_MID','Linh HR','Trợ lý nhân sự','Nhân sự','hr',
 'Hỗ trợ quy trình nội bộ, nhắc việc onboarding và soạn thông báo.',
 'Bạn là trợ lý nhân sự: giọng văn thân thiện, tuân thủ quy trình nội bộ.',
 'Từng hỗ trợ onboarding hàng trăm nhân sự mới và truyền thông nội bộ.',
 ARRAY['SUMMARIZE_WORK','DRAFT_EMAIL','PROPOSE_TASK']::text[],'MID',3000000,6500000,800,4.40,72,2050,8),
('MK_SUPPORT_MID','Nam Support','Nhân viên hỗ trợ khách hàng','Hỗ trợ khách hàng','support',
 'Phân loại yêu cầu, soạn phản hồi nháp và chuyển tiếp đúng người phụ trách.',
 'Bạn là nhân viên hỗ trợ: phản hồi nhanh, rõ ràng, nêu thời hạn xử lý.',
 'Xử lý hàng nghìn ticket, quen SLA và phân loại ưu tiên.',
 ARRAY['WORKLOAD_TRIAGE','DRAFT_EMAIL','PROPOSE_TASK_UPDATE']::text[],'MID',2800000,6000000,700,4.35,110,4310,9),
('MK_SUPPORT_SENIOR','Vy CX','Trưởng nhóm trải nghiệm khách hàng','Hỗ trợ khách hàng','support',
 'Giám sát chất lượng phản hồi và đề xuất cải tiến quy trình hỗ trợ.',
 'Bạn là trưởng nhóm hỗ trợ: đề cao chất lượng phản hồi và cam kết thời hạn.',
 'Xây dựng quy trình CX cho doanh nghiệp dịch vụ quy mô vừa.',
 ARRAY['WORKLOAD_TRIAGE','DRAFT_EMAIL','SUMMARIZE_WORK','PROPOSE_TASK_UPDATE']::text[],'LEAD',6500000,13000000,1600,4.75,39,1870,10),
('MK_LEGAL_SENIOR','Sơn Legal','Trợ lý pháp lý & tuân thủ','Pháp lý & Tuân thủ','legal',
 'Rà soát tài liệu, ghi nhận cam kết và nhắc mốc tuân thủ.',
 'Bạn là trợ lý pháp lý: thận trọng, nêu rõ rủi ro và điều khoản liên quan.',
 'Rà soát hợp đồng và theo dõi nghĩa vụ tuân thủ theo quý.',
 ARRAY['SUMMARIZE_WORK','MEETING_RECALL','PROPOSE_MEETING']::text[],'SENIOR',7000000,14000000,1800,4.65,27,760,11),
('MK_CONTENT_MID','Thu Content','Chuyên viên nội dung','Nội dung & Marketing','content',
 'Chuyển kết luận công việc thành nội dung truyền thông và bản tin nội bộ.',
 'Bạn là chuyên viên nội dung: viết mạch lạc, đúng thông điệp, luôn ở dạng nháp.',
 'Sản xuất bản tin nội bộ và nội dung truyền thông cho nhiều ngành.',
 ARRAY['DRAFT_FOLLOW_UP','DRAFT_EMAIL','SUMMARIZE_WORK']::text[],'MID',3200000,6800000,850,4.45,63,2240,12);

INSERT INTO public.ai_market_experiences (market_agent_id, industry, company_label, summary, duration_months, completed_tasks, sort_order)
SELECT a.id, e.industry, e.company_label, e.summary, e.months, e.tasks, e.ord
FROM public.ai_market_agents a
JOIN (VALUES
  ('MK_PROJECT_SENIOR','Công nghệ','Doanh nghiệp SaaS (ẩn danh)','Theo dõi 12 dự án song song, giảm 28% việc trễ hạn.',18,2100,1),
  ('MK_PROJECT_SENIOR','Sản xuất','Tập đoàn sản xuất (ẩn danh)','Điều phối tiến độ nhà máy và báo cáo tuần cho ban giám đốc.',10,1400,2),
  ('MK_PROJECT_MID','Công nghệ','Startup fintech (ẩn danh)','Điều phối sprint 2 tuần cho đội 12 người.',12,1600,1),
  ('MK_RESEARCH_SENIOR','Tài chính','Công ty chứng khoán (ẩn danh)','Tổng hợp báo cáo thị trường kèm trích dẫn nguồn.',14,900,1),
  ('MK_RESEARCH_JUNIOR','Giáo dục','Tổ chức đào tạo (ẩn danh)','Tra cứu tài liệu nội bộ cho đội học thuật.',8,520,1),
  ('MK_SALES_SENIOR','Bán lẻ','Chuỗi bán lẻ (ẩn danh)','Chăm sóc pipeline 400 cơ hội, tăng tỉ lệ phản hồi 32%.',16,1800,1),
  ('MK_SALES_MID','Dịch vụ','Công ty dịch vụ B2B (ẩn danh)','Nhắc cơ hội chững và soạn thư theo dõi.',9,860,1),
  ('MK_DATA_SENIOR','Logistics','Doanh nghiệp logistics (ẩn danh)','Chấm điểm rủi ro tiến độ theo tuần cho 6 phòng ban.',13,1100,1),
  ('MK_HR_MID','Công nghệ','Công ty phần mềm (ẩn danh)','Nhắc mốc onboarding cho 300 nhân sự mới.',15,1250,1),
  ('MK_SUPPORT_MID','Thương mại điện tử','Sàn TMĐT (ẩn danh)','Phân loại và soạn phản hồi nháp cho 4.000 ticket.',20,3200,1),
  ('MK_SUPPORT_SENIOR','Viễn thông','Nhà mạng (ẩn danh)','Chuẩn hoá quy trình CX, giảm thời gian phản hồi 41%.',11,1400,1),
  ('MK_LEGAL_SENIOR','Bất động sản','Tập đoàn BĐS (ẩn danh)','Rà soát điều khoản hợp đồng và theo dõi tuân thủ.',17,600,1),
  ('MK_CONTENT_MID','Marketing','Agency (ẩn danh)','Sản xuất bản tin nội bộ và nội dung sau họp.',12,1500,1)
) AS e(code, industry, company_label, summary, months, tasks, ord) ON e.code = a.code;

INSERT INTO public.ai_market_interview_cases (code, domain, prompt, rubric, max_score, sort_order) VALUES
('CASE_PROJECT_1','Quản lý dự án','Một dự án có 8 công việc quá hạn và 2 người phụ trách đang quá tải. Bạn xử lý theo thứ tự nào và đề xuất gì?','Nêu được thứ tự ưu tiên, lý do dựa trên dữ liệu, đề xuất hành động cụ thể cần người duyệt.',10,1),
('CASE_PROJECT_2','Quản lý dự án','Sau cuộc họp, có 5 cam kết nhưng không ai nhận trách nhiệm. Bạn làm gì?','Đề xuất task kèm người phụ trách và hạn chót, không tự thực thi.',10,2),
('CASE_RESEARCH_1','Nghiên cứu & Phân tích','Bạn được hỏi một câu mà tri thức nội bộ không có dữ liệu. Bạn trả lời thế nào?','Từ chối suy đoán, nêu rõ thiếu nguồn, gợi ý nguồn cần bổ sung.',10,1),
('CASE_SALES_1','Kinh doanh & CRM','Khách hàng im lặng 3 tuần sau báo giá. Soạn hướng tiếp cận.','Thư ngắn gọn, có giá trị mới, có bước tiếp theo rõ ràng, ở dạng nháp.',10,1),
('CASE_DATA_1','Dữ liệu & BI','Hãy giải thích cách bạn xếp ưu tiên hàng đợi công việc của một phòng ban.','Nêu tiêu chí định lượng, trọng số, và cách xử lý dữ liệu thiếu.',10,1),
('CASE_HR_1','Nhân sự','Nhân sự mới bỏ lỡ 3 mốc onboarding. Bạn đề xuất gì?','Giọng văn thân thiện, đề xuất nhắc việc và thông báo phù hợp quy trình.',10,1),
('CASE_SUPPORT_1','Hỗ trợ khách hàng','Ticket khẩn nhưng thiếu thông tin. Bạn phản hồi ra sao?','Hỏi đúng thông tin thiếu, nêu SLA, đề xuất chuyển đúng người phụ trách.',10,1),
('CASE_LEGAL_1','Pháp lý & Tuân thủ','Trong biên bản họp có cam kết ràng buộc chưa rà soát pháp lý. Bạn làm gì?','Chỉ ra rủi ro, trích dẫn phần biên bản, đề xuất họp rà soát.',10,1);