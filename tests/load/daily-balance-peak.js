import { check } from 'k6';
import http from 'k6/http';
import { authorized, tokenFor } from '../lib/auth.js';
import { businessDay } from '../lib/dates.js';

const DAILY_BALANCE_URL = 'http://daily-balance:3000';
const LEDGER_URL = 'http://ledger:3000';
const RATE = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || '2m';
const WRITE_RATE = Number(__ENV.WRITE_RATE || 5);

export const options = {
  scenarios: {
    consolidated_peak: {
      executor: 'constant-arrival-rate',
      exec: 'readBalance',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 60,
      maxVUs: 200,
    },
    ledger_writes: {
      executor: 'constant-arrival-rate',
      exec: 'recordEntry',
      rate: WRITE_RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 5,
      maxVUs: 50,
    },
  },
  thresholds: {
    'http_req_failed{scenario:consolidated_peak}': ['rate<0.05'],
    'http_req_duration{scenario:consolidated_peak}': ['p(95)<500'],
    'dropped_iterations{scenario:consolidated_peak}': ['count<1'],
    'http_req_failed{scenario:ledger_writes}': ['rate<0.01'],
  },
};

export const setup = () => ({
  operator: tokenFor('operador.centro'),
  viewer: tokenFor('analista.centro'),
});

const balanceUrls = () => [
  `${DAILY_BALANCE_URL}/v1/daily-balances/${businessDay()}`,
  `${DAILY_BALANCE_URL}/v1/daily-balances/${businessDay(1)}`,
  `${DAILY_BALANCE_URL}/v1/daily-balances?from=${businessDay(30)}&to=${businessDay()}`,
];

export const readBalance = (tokens) => {
  const urls = balanceUrls();
  const url = urls[Math.floor(Math.random() * urls.length)];
  const response = http.get(url, {
    ...authorized(tokens.viewer),
    tags: { name: url.includes('?') ? 'period report' : 'day balance' },
  });
  check(response, { 'balance answered with 200': (r) => r.status === 200 });
};

export const recordEntry = (tokens) => {
  const isCredit = Math.random() < 0.7;
  const response = http.post(
    `${LEDGER_URL}/v1/entries`,
    JSON.stringify({
      type: isCredit ? 'CREDIT' : 'DEBIT',
      amountInCents: 100 + Math.floor(Math.random() * 50_000),
      description: 'load test',
    }),
    { ...authorized(tokens.operator), tags: { name: 'record entry' } },
  );
  check(response, { 'entry recorded with 201': (r) => r.status === 201 });
};
