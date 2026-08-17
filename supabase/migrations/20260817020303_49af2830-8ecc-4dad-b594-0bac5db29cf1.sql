-- 1) Danh mục kỹ năng AI (global + theo tenant)
CREATE TABLE public.ai_market_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9_]{2,60}$'),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'RETRIEVAL' CHECK (kind IN ('RETRIEVAL','ANALYSIS','GENERATION','ACTION')),
  description text NOT NULL DEFAULT '',
  example text NOT NULL DEFAULT '',
  action_types text[] NOT NULL DEFAULT '{}',
  sources text[] NOT NULL DEFAULT '{}',
  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_market_skills_tenant_code_key UNIQUE NULLS NOT DISTINCT (tenant_id, code)
);

CREATE INDEX ai_market_skills_tenant_idx ON public.ai_market_skills (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_market_skills TO authenticated;
GRANT ALL ON public.ai_market_skills TO service_role;

ALTER TABLE public.ai_market_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_market_skills_select ON public.ai_market_skills
  FOR SELECT TO authenticated
  USING ((tenant_id IS NULL AND published) OR (tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id)));

CREATE POLICY ai_market_skills_insert ON public.ai_market_skills
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'))
  );

CREATE POLICY ai_market_skills_update ON public.ai_market_skills
  FOR UPDATE TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'))
  )
  WITH CHECK (
    tenant_id IS NOT NULL
    AND (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'))
  );

CREATE POLICY ai_market_skills_delete ON public.ai_market_skills
  FOR DELETE TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'))
  );

CREATE TRIGGER ai_market_skills_updated_at
  BEFORE UPDATE ON public.ai_market_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Ứng viên AI: cho phép tenant tự tạo hồ sơ riêng
ALTER TABLE public.ai_market_agents
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX ai_market_agents_tenant_idx ON public.ai_market_agents (tenant_id);

-- code chỉ cần duy nhất trong phạm vi tenant (global = tenant_id NULL)
ALTER TABLE public.ai_market_agents DROP CONSTRAINT ai_market_agents_code_key;
ALTER TABLE public.ai_market_agents
  ADD CONSTRAINT ai_market_agents_tenant_code_key UNIQUE NULLS NOT DISTINCT (tenant_id, code);

DROP POLICY ai_market_agents_select ON public.ai_market_agents;

CREATE POLICY ai_market_agents_select ON public.ai_market_agents
  FOR SELECT TO authenticated
  USING ((tenant_id IS NULL AND published) OR (tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id)));

CREATE POLICY ai_market_agents_insert ON public.ai_market_agents
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'))
  );

CREATE POLICY ai_market_agents_update ON public.ai_market_agents
  FOR UPDATE TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'))
  )
  WITH CHECK (
    tenant_id IS NOT NULL
    AND (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'))
  );

CREATE POLICY ai_market_agents_delete ON public.ai_market_agents
  FOR DELETE TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'))
  );

-- 3) Hồ sơ kinh nghiệm: theo phạm vi hiển thị của ứng viên
DROP POLICY ai_market_exp_select ON public.ai_market_experiences;
CREATE POLICY ai_market_exp_select ON public.ai_market_experiences
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ai_market_agents a
    WHERE a.id = ai_market_experiences.market_agent_id
      AND ((a.tenant_id IS NULL AND a.published) OR (a.tenant_id IS NOT NULL AND public.is_tenant_member(a.tenant_id)))
  ));

-- 4) Seed danh mục kỹ năng dùng chung
INSERT INTO public.ai_market_skills (tenant_id, code, name, kind, description, example, action_types, sources, sort_order) VALUES
(NULL,'SUMMARIZE_WORK','Tóm tắt ngữ cảnh công việc','RETRIEVAL','Đọc task, tài liệu và cuộc họp liên quan để tóm tắt tình hình.','Tóm tắt tình trạng công việc "Triển khai UAT" trong 7 ngày qua.','{}','{PROJECT_CONTEXT,WORKFLOW_AGENT}',10),
(NULL,'MEETING_RECALL','Tra cứu nội dung cuộc họp','RETRIEVAL','Trả lời dựa trên biên bản, quyết định và action item đã grounding.','Cuộc họp hôm qua đã chốt quyết định nào về ngân sách?','{}','{MEETING_INTELLIGENCE,WORKFLOW_AGENT}',20),
(NULL,'RISK_ANALYSIS','Phân tích rủi ro tiến độ','ANALYSIS','Đánh giá nguy cơ trễ hạn dựa trên trạng thái, deadline và người phụ trách.','Chỉ ra 5 công việc có nguy cơ trễ hạn cao nhất tuần này.','{}','{PROJECT_CONTEXT,WORKFLOW_AGENT}',30),
(NULL,'WORKLOAD_TRIAGE','Phân loại & xếp ưu tiên','ANALYSIS','Nhóm và xếp hạng công việc theo mức độ khẩn cấp, đề xuất người phụ trách.','Xếp thứ tự xử lý cho các task chưa có người nhận.','{UPDATE_TASK_FIELDS}','{PROJECT_CONTEXT,WORKFLOW_AGENT}',40),
(NULL,'DRAFT_EMAIL','Soạn thư nháp','GENERATION','Viết thư trả lời hoặc thư nhắc dựa trên ngữ cảnh, để bạn duyệt trước khi gửi.','Soạn thư nhắc khách hàng phản hồi báo giá.','{CREATE_EMAIL_DRAFT}','{EMAIL_INTELLIGENCE,WORKFLOW_AGENT}',50),
(NULL,'DRAFT_FOLLOW_UP','Soạn nội dung theo dõi sau họp','GENERATION','Chuyển kết luận cuộc họp thành nội dung theo dõi có trích dẫn nguồn.','Soạn tóm tắt và việc cần làm sau cuộc họp sprint review.','{CREATE_EMAIL_DRAFT}','{MEETING_INTELLIGENCE,WORKFLOW_AGENT}',60),
(NULL,'PROPOSE_TASK','Đề xuất tạo công việc','ACTION','Sinh đề xuất tạo task mới kèm tiêu đề, người phụ trách và hạn.','Tạo task theo dõi cho mỗi action item chưa có chủ.','{CREATE_TASK}','{PROJECT_CONTEXT,MEETING_INTELLIGENCE,WORKFLOW_AGENT}',70),
(NULL,'PROPOSE_TASK_UPDATE','Đề xuất cập nhật công việc','ACTION','Đề xuất đổi trạng thái, ưu tiên, hạn hoặc người phụ trách của task.','Đề xuất dời hạn các task quá hạn quá 7 ngày.','{UPDATE_TASK_FIELDS}','{PROJECT_CONTEXT,WORKFLOW_AGENT}',80),
(NULL,'PROPOSE_MEETING','Đề xuất đặt lịch họp','ACTION','Sinh đề xuất cuộc họp follow-up với thành phần và thời lượng gợi ý.','Đặt lịch họp rà soát cho các hạng mục bị chặn.','{CREATE_MEETING}','{MEETING_INTELLIGENCE,PROJECT_CONTEXT,WORKFLOW_AGENT}',90);