// Shared helpers cho toàn bộ k6 scenarios của UniWork.
// Không dùng service role. Mỗi VU đăng nhập bằng 1 fixture user riêng.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const SUPABASE_URL = __ENV.SUPABASE_URL;
export const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
export const APP_URL = __ENV.APP_URL || 'http://localhost:8080';

// Fixture users: JSON array [{email, password, tenant}] nạp qua K6_USERS_FILE.
const users = JSON.parse(open(__ENV.K6_USERS_FILE || './fixtures/users.json'));

export function pickUser(vu) {
  return users[(vu - 1) % users.length];
}

export function login(user) {
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, tags: { op: 'auth_login' } },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  const body = res.json();
  return body && body.access_token ? body.access_token : null;
}

export function authHeaders(token) {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Think time thực tế 1–8s theo yêu cầu §88.
export function think(min = 1, max = 8) {
  sleep(min + Math.random() * (max - min));
}

export const SLO = {
  crud: { p50: 150, p95: 300, p99: 800 },
  list: { p95: 500, p99: 1000 },
  heavy: { p95: 1000, p99: 2000 },
};

export const thresholds = {
  http_req_failed: ['rate<0.001'],
  'http_req_duration{kind:crud}': ['p(50)<150', 'p(95)<300', 'p(99)<800'],
  'http_req_duration{kind:list}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{kind:heavy}': ['p(95)<1000', 'p(99)<2000'],
};
