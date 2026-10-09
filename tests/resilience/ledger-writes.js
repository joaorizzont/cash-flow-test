import { check } from 'k6';
import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { authorized, tokenFor } from '../lib/auth.js';

const LEDGER_URL = __ENV.LEDGER_URL || 'http://ledger:3000';
const RATE = Number(__ENV.RATE || 10);
const DURATION = __ENV.DURATION || '90s';

const entriesRecorded = new Counter('entries_recorded');
const amountRecorded = new Counter('amount_recorded_cents');

export const options = {
  scenarios: {
    ledger_writes: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 10,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<500'],
    dropped_iterations: ['count<1'],
  },
};

export const setup = () => ({ token: tokenFor(__ENV.USERNAME || 'operador.norte') });

export default (data) => {
  const amountInCents = 100 + Math.floor(Math.random() * 10_000);
  const response = http.post(
    `${LEDGER_URL}/v1/entries`,
    JSON.stringify({ type: 'CREDIT', amountInCents, description: 'resilience test' }),
    authorized(data.token),
  );
  const recorded = check(response, { 'entry recorded with 201': (r) => r.status === 201 });
  if (recorded) {
    entriesRecorded.add(1);
    amountRecorded.add(amountInCents);
  }
};
