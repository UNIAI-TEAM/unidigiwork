// Thân chung cho mọi mức tải: chỉ khác stages.
import http from 'k6/http';
import { check } from 'k6';
import { SUPABASE_URL, pickUser, login, authHeaders, think } from './lib/common.js';
import { pickAction } from '../workloads/standard-mix.js';

const rest = (p) => `${SUPABASE_URL}/rest/v1/${p}`;

export function runUserJourney(state) {
  if (!state.token) state.token = login(pickUser(__VU));
  if (!state.token) return;
  const h = { headers: authHeaders(state.token) };
  const a = pickAction();
  let res;
  switch (a.name) {
    case 'dashboard':
      res = http.batch([
        ['GET', rest('tenant_members?select=role,tenant_id&status=eq.active'), null, { ...h, tags: { kind: 'list', op: 'tenant_ctx' } }],
        ['GET', rest('tasks?select=id,title,status,due_at&order=updated_at.desc&limit=20'), null, { ...h, tags: { kind: 'list', op: 'dash_tasks' } }],
        ['GET', rest('meetings?select=id,title,start_at&order=start_at.asc&limit=10'), null, { ...h, tags: { kind: 'list', op: 'dash_meetings' } }],
        ['GET', rest('notifications?select=id,title,is_read&order=created_at.desc&limit=20'), null, { ...h, tags: { kind: 'list', op: 'dash_notifs' } }],
      ]);
      check(res[0], { 'dashboard ok': (r) => r.status === 200 });
      break;
    case 'task_read':
      res = http.get(rest('tasks?select=id,title,status,priority,due_at&order=updated_at.desc&limit=50'), { ...h, tags: { kind: 'list', op: 'task_list' } });
      check(res, { 'tasks 200': (r) => r.status === 200 });
      break;
    case 'task_write':
      res = http.post(`${SUPABASE_URL}/rest/v1/rpc/create_task`, JSON.stringify({ p_title: `k6-${__VU}-${Date.now()}` }), { ...h, tags: { kind: 'crud', op: 'task_create' } });
      break;
    case 'chat':
      res = http.get(rest('chat_messages?select=id,body,created_at&order=created_at.desc&limit=30'), { ...h, tags: { kind: 'list', op: 'chat_list' } });
      break;
    case 'notifications':
      res = http.get(rest('notifications?select=id,is_read&is_read=eq.false&limit=50'), { ...h, tags: { kind: 'list', op: 'notif_unread' } });
      break;
    case 'calendar':
      res = http.get(rest('meetings?select=id,title,start_at,end_at&order=start_at.asc&limit=100'), { ...h, tags: { kind: 'list', op: 'calendar' } });
      break;
    case 'email':
      res = http.get(rest('email_states?select=message_id,folder,is_read&folder=eq.inbox&limit=20'), { ...h, tags: { kind: 'list', op: 'email_inbox' } });
      break;
    case 'documents':
      res = http.get(rest('documents?select=id,title,updated_at&order=updated_at.desc&limit=20'), { ...h, tags: { kind: 'list', op: 'doc_list' } });
      break;
    default:
      res = http.get(rest('audit_events?select=id,event_type,occurred_at&order=occurred_at.desc&limit=50'), { ...h, tags: { kind: 'heavy', op: 'audit' } });
  }
  think();
}
