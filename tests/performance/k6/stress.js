import { thresholds } from './lib/common.js';
import { runUserJourney } from './scenario.js';

export const options = {
  thresholds,
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 5000 },
        { duration: '30m', target: 5000 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
};

const state = {};
export default function () {
  runUserJourney(state);
}
