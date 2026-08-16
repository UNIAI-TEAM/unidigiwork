CREATE TABLE public.ai_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9_]{2,60}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  kind text NOT NULL,
  description text NOT NULL DEFAULT '',
  example text NOT NULL DEFAULT '',
  action_types text[] NOT NULL DEFAULT '{}',
  sources text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_skills_kind_chk CHECK (kind IN ('RETRIEVAL','ANALYSIS','GENERATION','ACTION')),
  CONSTRAINT ai_skills_action_types_chk CHECK (action_types <@ ARRAY['CREATE_TASK','UPDATE_TASK_FIELDS','CREATE_MEETING','CREATE_EMAIL_DRAFT']::text[]),
  CONSTRAINT ai_skills_sources_chk CHECK (sources <@ ARRAY['MEETING_INTELLIGENCE','EMAIL_INTELLIGENCE','PROJECT_CONTEXT','WORKFLOW_AGENT']::text[])
);

CREATE UNIQUE INDEX ai_skills_tenant_code_uidx
  ON public.ai_skills(tenant_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
  WHERE deleted_at IS NULL;
CREATE INDEX ai_skills_ws_idx ON public.ai_skills(workspace_id, enabled);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_skills TO authenticated;
GRANT ALL ON public.ai_skills TO service_role;
ALTER TABLE public.ai_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_skills_select ON public.ai_skills FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);
CREATE POLICY ai_skills_write ON public.ai_skills FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id))
  WITH CHECK (
    is_tenant_member(tenant_id)
    AND (
      workspace_id IS NULL
      OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = ai_skills.workspace_id AND w.tenant_id = ai_skills.tenant_id)
    )
  );

CREATE TRIGGER ai_skills_updated_at BEFORE UPDATE ON public.ai_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed danh mục kỹ năng hệ thống cho từng tenant (dùng chung toàn tenant: workspace_id NULL)
INSERT INTO public.ai_skills (tenant_id, workspace_id, code, name, kind, description, example, action_types, sources, is_system)
SELECT t.id, NULL, c.code, c.name, c.kind, c.description, c.example, c.action_types, c.sources, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('SUMMARIZE_WORK','Tóm tắt ngữ cảnh công việc','RETRIEVAL','Đọc task, tài liệu và cuộc họp liên quan để tóm tắt tình hình.','Tóm tắt tình hình dự án tuần này.', '{}'::text[], ARRAY['PROJECT_CONTEXT','WORKFLOW_AGENT']::text[]),
  ('MEETING_RECALL','Tra cứu nội dung cuộc họp','RETRIEVAL','Trả lời câu hỏi dựa trên biên bản, quyết định và action item đã grounding.','Cuộc họp hôm qua chốt điều gì?', '{}'::text[], ARRAY['MEETING_INTELLIGENCE','WORKFLOW_AGENT']::text[]),
  ('RISK_ANALYSIS','Phân tích rủi ro','ANALYSIS','Phát hiện việc trễ hạn, thiếu người phụ trách hoặc rủi ro tiến độ.','Chỉ ra các rủi ro trễ hạn tuần tới.', '{}'::text[], ARRAY['PROJECT_CONTEXT','WORKFLOW_AGENT']::text[]),
  ('WORKLOAD_TRIAGE','Cân tải công việc','ANALYSIS','Đánh giá khối lượng và đề xuất điều chỉnh ưu tiên/hạn chót.','Ai đang quá tải trong sprint này?', ARRAY['UPDATE_TASK_FIELDS']::text[], ARRAY['PROJECT_CONTEXT','WORKFLOW_AGENT']::text[]),
  ('DRAFT_EMAIL','Soạn nháp email','GENERATION','Tạo nháp email theo ngữ cảnh, chưa gửi đi.','Soạn nháp trả lời khách hàng.', ARRAY['CREATE_EMAIL_DRAFT']::text[], ARRAY['EMAIL_INTELLIGENCE','WORKFLOW_AGENT']::text[]),
  ('DRAFT_FOLLOW_UP','Soạn nháp email sau họp','GENERATION','Tạo nháp email tổng kết sau cuộc họp.','Gửi tóm tắt sau buổi demo.', ARRAY['CREATE_EMAIL_DRAFT']::text[], ARRAY['MEETING_INTELLIGENCE','WORKFLOW_AGENT']::text[]),
  ('PROPOSE_TASK','Đề xuất tạo công việc','ACTION','Đề xuất tạo task mới, cần người xác nhận.','Tạo task theo action item cuộc họp.', ARRAY['CREATE_TASK']::text[], ARRAY['PROJECT_CONTEXT','MEETING_INTELLIGENCE','WORKFLOW_AGENT']::text[]),
  ('PROPOSE_TASK_UPDATE','Đề xuất cập nhật công việc','ACTION','Đề xuất đổi hạn, ưu tiên hoặc người phụ trách.','Đề xuất dời hạn task trễ.', ARRAY['UPDATE_TASK_FIELDS']::text[], ARRAY['PROJECT_CONTEXT','WORKFLOW_AGENT']::text[]),
  ('PROPOSE_MEETING','Đề xuất tạo cuộc họp','ACTION','Đề xuất lịch họp theo dõi.','Đặt họp review sau 1 tuần.', ARRAY['CREATE_MEETING']::text[], ARRAY['MEETING_INTELLIGENCE','PROJECT_CONTEXT','WORKFLOW_AGENT']::text[])
) AS c(code, name, kind, description, example, action_types, sources)
ON CONFLICT DO NOTHING;