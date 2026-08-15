import http from 'k6/http';
import { SUPABASE_URL, pickUser, login, authHeaders } from './lib/common.js';

export const options = {
  scenarios: {
    storm: { executor: 'constant-arrival-rate', rate: parseInt(__ENV.MSG_RATE || '200', 10), timeUnit: '1s', duration: '3m', preAllocatedVUs: 200, maxVUs: 1000 },
  },
  thresholds: { http_req_failed: ['rate<0.01'], 'http_req_duration{kind:crud}': ['p(95)<300'] },
};

const state = {};
export default function () {
  if (!state.token) state.token = login(pickUser(__VU));
  const channelId = __ENV.CHANNEL_ID;
  http.post(`${SUPABASE_URL}/rest/v1/rpc/send_chat_message`,
    JSON.stringify({ p_channel_id: channelId, p_body: `storm ${__VU}-${__ITER}` }),
    { headers: authHeaders(state.token), tags: { kind: 'crud', op: 'chat_send' } });
}
