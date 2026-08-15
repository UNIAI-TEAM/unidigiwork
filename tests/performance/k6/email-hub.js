import http from 'k6/http';
import { SUPABASE_URL, pickUser, login, authHeaders, think } from './lib/common.js';

export const options = {
  thresholds: { http_req_failed: ['rate<0.001'], 'http_req_duration{kind:list}': ['p(95)<500'], 'http_req_duration{kind:heavy}': ['p(95)<1000'] },
  scenarios: { email: { executor: 'ramping-vus', stages: [{ duration: '2m', target: parseInt(__ENV.VUS || '250', 10) }, { duration: '10m', target: parseInt(__ENV.VUS || '250', 10) }, { duration: '1m', target: 0 }] } },
};

const rest = (p) => `${SUPABASE_URL}/rest/v1/${p}`;
const state = {};
export default function () {
  if (!state.token) state.token = login(pickUser(__VU));
  const h = { headers: authHeaders(state.token) };
  http.get(rest('email_states?select=message_id,is_read,folder&folder=eq.inbox&order=updated_at.desc&limit=20'), { ...h, tags: { kind: 'list', op: 'inbox' } });
  http.get(rest('email_states?select=message_id&folder=eq.inbox&is_read=eq.false&limit=50'), { ...h, tags: { kind: 'list', op: 'inbox_unread' } });
  http.get(rest('email_messages?select=id,subject,sent_at&subject=ilike.*bao cao*&limit=20'), { ...h, tags: { kind: 'heavy', op: 'email_search' } });
  think(2, 6);
}
