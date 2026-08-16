import http from 'k6/http';
import { check, sleep } from 'k6';

const URL = __ENV.SUPABASE_URL;
const KEY = __ENV.SUPABASE_ANON_KEY;
const TOKEN = __ENV.ACCESS_TOKEN;
const rest = (p) => `${URL}/rest/v1/${p}`;
const h = { headers: { apikey: KEY, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } };

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:list}': ['p(95)<500', 'p(99)<1000'],
    'http_req_duration{kind:rpc}': ['p(95)<300'],
    'http_req_duration{kind:heavy}': ['p(95)<1000'],
  },
  scenarios: {
    tier: {
      executor: 'ramping-vus', startVUs: 0,
      stages: [
        { duration: '60s', target: 400 },
        { duration: '60s', target: 1000 },
        { duration: __ENV.STEADY || '120s', target: 1000 },
        { duration: '30s', target: 0 },
      ],
    },
  },
};

function think() { sleep(1 + Math.random() * 7); }

export default function () {
  const r = Math.random() * 100;
  let res;
  if (r < 35) {
    const b = http.batch([
      ['GET', rest('tasks?select=id,title,status,due_at&order=updated_at.desc&limit=20'), null, { ...h, tags: { kind: 'list', op: 'dash_tasks' } }],
      ['GET', rest('meetings?select=id,title,start_at&order=start_at.asc&limit=10'), null, { ...h, tags: { kind: 'list', op: 'dash_meetings' } }],
      ['GET', rest('notifications?select=id,title,is_read&order=created_at.desc&limit=20'), null, { ...h, tags: { kind: 'list', op: 'dash_notifs' } }],
    ]);
    check(b[0], { 'dash ok': (x) => x.status === 200 });
  } else if (r < 55) {
    res = http.get(rest('tasks?select=id,title,status,priority,due_at&order=updated_at.desc&limit=50'), { ...h, tags: { kind: 'list', op: 'task_list' } });
    check(res, { 'tasks ok': (x) => x.status === 200 });
  } else if (r < 65) {
    res = http.post(`${URL}/rest/v1/rpc/get_unread_counts`, '{}', { ...h, tags: { kind: 'rpc', op: 'unread_rpc' } });
    check(res, { 'unread ok': (x) => x.status === 200 });
  } else if (r < 75) {
    res = http.get(rest('chat_messages?select=id,body,created_at&order=created_at.desc&limit=30'), { ...h, tags: { kind: 'list', op: 'chat_list' } });
    check(res, { 'chat ok': (x) => x.status === 200 });
  } else if (r < 82) {
    res = http.get(rest('meetings?select=id,title,start_at,end_at&order=start_at.asc&limit=100'), { ...h, tags: { kind: 'list', op: 'calendar' } });
    check(res, { 'cal ok': (x) => x.status === 200 });
  } else if (r < 90) {
    res = http.get(rest('email_states?select=message_id,folder,is_read&folder=eq.inbox&limit=20'), { ...h, tags: { kind: 'list', op: 'email_inbox' } });
    check(res, { 'email ok': (x) => x.status === 200 });
  } else if (r < 96) {
    res = http.get(rest('documents?select=id,title,updated_at&order=updated_at.desc&limit=20'), { ...h, tags: { kind: 'list', op: 'doc_list' } });
    check(res, { 'docs ok': (x) => x.status === 200 });
  } else {
    res = http.get(rest('audit_events?select=id,event_type,occurred_at&order=occurred_at.desc&limit=50'), { ...h, tags: { kind: 'heavy', op: 'audit' } });
    check(res, { 'audit ok': (x) => x.status === 200 });
  }
  think();
}
