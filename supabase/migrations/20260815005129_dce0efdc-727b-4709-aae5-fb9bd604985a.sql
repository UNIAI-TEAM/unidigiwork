do $$
declare
  v_tenant uuid := '64028bca-b1ad-4870-8607-ecdf5f4663a9';
  v_ws     uuid := '64028bca-b1ad-4870-8607-ecdf5f4663a9';
  v_user   uuid := '7177e35b-ede4-4ad4-b575-a24fc6c89b61';
  v_ch     uuid := 'd0000000-0000-4000-8000-000000000001';
  v_th1    uuid := 'd0000000-0000-4000-8000-000000000011';
  v_th2    uuid := 'd0000000-0000-4000-8000-000000000012';
  v_th3    uuid := 'd0000000-0000-4000-8000-000000000013';
  v_m1     uuid := 'd0000000-0000-4000-8000-000000000021';
  v_m2     uuid := 'd0000000-0000-4000-8000-000000000022';
  v_m3     uuid := 'd0000000-0000-4000-8000-000000000023';
  v_e1     uuid := 'd0000000-0000-4000-8000-000000000031';
  v_e2     uuid := 'd0000000-0000-4000-8000-000000000032';
  v_e3     uuid := 'd0000000-0000-4000-8000-000000000033';
begin
  insert into public.tasks (id, tenant_id, workspace_id, title, description, status, priority, due_at, tags, created_by, updated_by)
  values
    ('d0000000-0000-4000-8000-000000000101', v_tenant, v_ws, 'Chuẩn bị báo cáo tuần cho ban điều hành', 'Tổng hợp KPI, tiến độ dự án và rủi ro chính.', 'in_progress', 'high', now() + interval '1 day', array['báo cáo','tuần'], v_user, v_user),
    ('d0000000-0000-4000-8000-000000000102', v_tenant, v_ws, 'Review hợp đồng đối tác Bến Thành', 'Kiểm tra điều khoản thanh toán và SLA.', 'todo', 'urgent', now() + interval '4 hours', array['pháp lý'], v_user, v_user),
    ('d0000000-0000-4000-8000-000000000103', v_tenant, v_ws, 'Cập nhật tài liệu onboarding nhân sự mới', null, 'todo', 'normal', now() + interval '5 days', array['hr','tài liệu'], v_user, v_user),
    ('d0000000-0000-4000-8000-000000000104', v_tenant, v_ws, 'Fix lỗi đồng bộ lịch trên mobile', 'Lịch không refresh sau khi tạo cuộc họp.', 'blocked', 'high', now() - interval '1 day', array['bug','mobile'], v_user, v_user),
    ('d0000000-0000-4000-8000-000000000105', v_tenant, v_ws, 'Gửi bản demo PWA cho khách hàng', null, 'done', 'normal', now() - interval '2 days', array['demo'], v_user, v_user),
    ('d0000000-0000-4000-8000-000000000106', v_tenant, v_ws, 'Lập kế hoạch sprint tháng 9', null, 'todo', 'low', now() + interval '8 days', array['planning'], v_user, v_user)
  on conflict (id) do nothing;

  update public.tasks set completed_at = now() - interval '2 days'
  where id = 'd0000000-0000-4000-8000-000000000105' and completed_at is null;

  insert into public.task_assignees (task_id, user_id)
  select t.id, v_user from public.tasks t
  where t.id in ('d0000000-0000-4000-8000-000000000101','d0000000-0000-4000-8000-000000000102','d0000000-0000-4000-8000-000000000104','d0000000-0000-4000-8000-000000000106')
  on conflict do nothing;

  insert into public.meetings (id, tenant_id, workspace_id, title, agenda, start_at, end_at, timezone, location, conference_provider, status, created_by, updated_by)
  values
    (v_m1, v_tenant, v_ws, 'Daily standup nhóm sản phẩm', 'Cập nhật tiến độ, blocker.', date_trunc('hour', now()) + interval '2 hours', date_trunc('hour', now()) + interval '2 hours 30 minutes', 'Asia/Ho_Chi_Minh', 'Phòng họp A', 'livekit', 'scheduled', v_user, v_user),
    (v_m2, v_tenant, v_ws, 'Demo PWA với khách hàng Vinatex', 'Trình bày 5 tab mobile.', now() + interval '1 day', now() + interval '1 day 1 hour', 'Asia/Ho_Chi_Minh', 'Online', 'livekit', 'scheduled', v_user, v_user),
    (v_m3, v_tenant, v_ws, 'Retro sprint 12', null, now() - interval '1 day', now() - interval '23 hours', 'Asia/Ho_Chi_Minh', 'Online', 'livekit', 'ended', v_user, v_user)
  on conflict (id) do nothing;

  insert into public.meeting_participants (meeting_id, user_id, tenant_id, role, rsvp, rsvp_at)
  values
    (v_m1, v_user, v_tenant, 'host', 'accepted', now()),
    (v_m2, v_user, v_tenant, 'host', 'accepted', now()),
    (v_m3, v_user, v_tenant, 'host', 'accepted', now())
  on conflict do nothing;

  insert into public.chat_channels (id, tenant_id, workspace_id, name, description, kind, is_private, last_message_at, created_by, updated_by)
  values (v_ch, v_tenant, v_ws, 'general', 'Kênh trao đổi chung của workspace', 'channel', false, now(), v_user, v_user)
  on conflict (id) do nothing;

  insert into public.chat_members (channel_id, user_id, tenant_id, role)
  values (v_ch, v_user, v_tenant, 'owner')
  on conflict do nothing;

  insert into public.chat_messages (id, channel_id, tenant_id, author_id, body, created_at)
  values
    ('d0000000-0000-4000-8000-000000000201', v_ch, v_tenant, v_user, 'Chào cả nhà, bản PWA mobile đã lên preview nhé.', now() - interval '3 hours'),
    ('d0000000-0000-4000-8000-000000000202', v_ch, v_tenant, v_user, 'Mọi người test giúp 5 tab: Home, Chat, Task, Meet, Email.', now() - interval '2 hours 40 minutes'),
    ('d0000000-0000-4000-8000-000000000203', v_ch, v_tenant, v_user, 'Có gì lỗi thì tạo task ngay trong chat nhé.', now() - interval '30 minutes')
  on conflict (id) do nothing;

  insert into public.email_threads (id, workspace_id, tenant_id, subject, last_message_at, created_by, updated_by)
  values
    (v_th1, v_ws, v_tenant, 'Kế hoạch triển khai UNIWORK quý 3', now() - interval '1 hour', v_user, v_user),
    (v_th2, v_ws, v_tenant, 'Hợp đồng đối tác Bến Thành - bản cuối', now() - interval '5 hours', v_user, v_user),
    (v_th3, v_ws, v_tenant, 'Biên bản họp retro sprint 12', now() - interval '1 day', v_user, v_user)
  on conflict (id) do nothing;

  insert into public.email_messages (id, thread_id, workspace_id, tenant_id, from_user_id, to_user_ids, subject, body, is_draft, sent_at, created_at, created_by, updated_by)
  values
    (v_e1, v_th1, v_ws, v_tenant, v_user, array[v_user], 'Kế hoạch triển khai UNIWORK quý 3', E'Chào anh/chị,\n\nĐính kèm là kế hoạch triển khai quý 3 gồm 3 giai đoạn: chuẩn hoá dữ liệu, mở rộng workspace và bật PWA cho toàn bộ nhân sự.\n\nTrân trọng.', false, now() - interval '1 hour', now() - interval '1 hour', v_user, v_user),
    (v_e2, v_th2, v_ws, v_tenant, v_user, array[v_user], 'Hợp đồng đối tác Bến Thành - bản cuối', E'Anh xem giúp điều khoản thanh toán mục 4.2 và SLA mục 7 trước 17h hôm nay nhé.', false, now() - interval '5 hours', now() - interval '5 hours', v_user, v_user),
    (v_e3, v_th3, v_ws, v_tenant, v_user, array[v_user], 'Biên bản họp retro sprint 12', E'Tóm tắt: 3 điểm làm tốt, 2 điểm cần cải thiện, 4 hành động tiếp theo đã tạo task tương ứng.', false, now() - interval '1 day', now() - interval '1 day', v_user, v_user)
  on conflict (id) do nothing;

  insert into public.email_states (message_id, user_id, tenant_id, folder, is_read, is_starred)
  values
    (v_e1, v_user, v_tenant, 'inbox', false, true),
    (v_e2, v_user, v_tenant, 'inbox', false, false),
    (v_e3, v_user, v_tenant, 'inbox', true, false)
  on conflict do nothing;

  insert into public.notifications (id, user_id, workspace_id, tenant_id, type, title, body, link, meta, is_read, created_at)
  values
    ('d0000000-0000-4000-8000-000000000301', v_user, v_ws, v_tenant, 'meeting', 'Sắp tới: Daily standup nhóm sản phẩm', 'Bắt đầu trong 2 giờ nữa.', '/m/meet', '{"priority":"high"}', false, now() - interval '10 minutes'),
    ('d0000000-0000-4000-8000-000000000302', v_user, v_ws, v_tenant, 'task', 'Task quá hạn: Fix lỗi đồng bộ lịch trên mobile', 'Đã quá hạn 1 ngày.', '/m/tasks', '{"priority":"urgent"}', false, now() - interval '1 hour'),
    ('d0000000-0000-4000-8000-000000000303', v_user, v_ws, v_tenant, 'email', 'Email mới từ đối tác Bến Thành', 'Hợp đồng bản cuối cần duyệt.', '/m/email', '{"priority":"normal"}', false, now() - interval '5 hours'),
    ('d0000000-0000-4000-8000-000000000304', v_user, v_ws, v_tenant, 'chat', 'Bạn được nhắc tên trong #general', 'Mọi người test giúp 5 tab.', '/m/chat', '{"priority":"low"}', true, now() - interval '2 hours')
  on conflict (id) do nothing;
end $$;