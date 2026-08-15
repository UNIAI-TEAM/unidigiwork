// Chạy lần lượt các mức 100 → 250 → 500 → 1000 → 2500 → 5000 (§16–21).
// k6 run -e TIER=500 tests/performance/k6/load-tiers.js
import { thresholds } from './lib/common.js';
import { runUserJourney } from './scenario.js';

const TIER = parseInt(__ENV.TIER || '100', 10);

export const options = {
  thresholds,
  scenarios: {
    tier: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: Math.round(TIER * 0.4) },
        { duration: '3m', target: Math.round(TIER * 0.8) },
        { duration: '2m', target: TIER },
        { duration: __ENV.STEADY || '15m', target: TIER },
        { duration: '2m', target: 100 },
      ],
    },
  },
};

const state = {};
export default function () {
  runUserJourney(state);
}
