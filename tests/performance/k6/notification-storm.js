// Fanout 1 event → 100 / 1000 / 5000 người nhận. Đo thời gian sinh + drain outbox.
import http from 'k6/http';
import { SUPABASE_URL, pickUser, login, authHeaders } from './lib/common.js';

export const options = { vus: 1, iterations: 3, thresholds: { http_req_failed: ['rate<0.01'] } };

const FANOUTS = [100, 1000, 5000];
const state = {};
export default function () {
  if (!state.token) state.token = login(pickUser(1));
  const n = FANOUTS[__ITER % FANOUTS.length];
  http.post(`${SUPABASE_URL}/rest/v1/rpc/broadcast_announcement`,
    JSON.stringify({ p_limit: n, p_title: `k6 storm ${n}` }),
    { headers: authHeaders(state.token), tags: { kind: 'heavy', op: 'notif_fanout' } });
}
