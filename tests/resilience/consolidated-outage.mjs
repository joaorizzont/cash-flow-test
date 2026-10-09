import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { compose, log, runK6 } from './compose.mjs';

const KEYCLOAK_URL = process.env.KEYCLOAK_PUBLIC_URL ?? 'http://localhost:8180';
const DAILY_BALANCE_URL = process.env.DAILY_BALANCE_PUBLIC_URL ?? 'http://localhost:3002';
const USERNAME = 'operador.norte';
const WRITE_RATE = process.env.RATE ?? '10';
const TEST_DURATION = '90s';
const WARM_UP_MS = 20_000;
const OUTAGE_MS = Number(process.env.OUTAGE_SECONDS ?? 30) * 1_000;
const CATCH_UP_TIMEOUT_MS = 180_000;
const SUMMARY_FILE = new URL('../results/resilience.json', import.meta.url);
const CONSOLIDATED_SERVICES = ['postgres-daily-balance', 'daily-balance', 'daily-balance-consumer'];

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

const accessToken = async () => {
  const response = await fetch(`${KEYCLOAK_URL}/realms/cash-flow/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'cash-flow-app',
      username: USERNAME,
      password: 'cashflow',
    }),
  });
  const body = await response.json();
  return body.access_token;
};

const consolidatedBalance = async () => {
  try {
    const response = await fetch(`${DAILY_BALANCE_URL}/v1/daily-balances/${today()}`, {
      headers: { authorization: `Bearer ${await accessToken()}` },
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
};

const waitForBalance = async (expected) => {
  const deadline = Date.now() + CATCH_UP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const balance = await consolidatedBalance();
    if (
      balance?.entryCount === expected.entryCount &&
      balance.totalCreditsInCents === expected.totalCreditsInCents
    ) {
      return balance;
    }
    await sleep(2_000);
  }
  return consolidatedBalance();
};

const runOutage = async () => {
  await sleep(WARM_UP_MS);
  log(`Derrubando o consolidado: ${CONSOLIDATED_SERVICES.join(', ')}`);
  await compose(['stop', ...CONSOLIDATED_SERVICES], { quiet: true });
  const probe = await consolidatedBalance();
  log(
    probe === null ? 'Consolidado fora do ar (confirmado)' : 'ATENÇÃO: consolidado ainda responde',
  );
  await sleep(OUTAGE_MS);
  log('Religando o consolidado');
  await compose(['up', '-d', '--wait', ...CONSOLIDATED_SERVICES], { quiet: true });
  log('Consolidado de volta');
};

const startLoad = () =>
  runK6({
    script: 'resilience/ledger-writes.js',
    summary: 'resilience',
    env: { RATE: WRITE_RATE, DURATION: TEST_DURATION },
  });

const readLoadSummary = async () => {
  const { metrics } = JSON.parse(await readFile(SUMMARY_FILE, 'utf8'));
  return {
    requests: metrics.iterations.count,
    failures: metrics.http_req_failed.passes,
    recorded: metrics.entries_recorded?.count ?? 0,
    amount: metrics.amount_recorded_cents?.count ?? 0,
  };
};

const report = ({ load, baseline, expected, final }) => {
  log('Resultado');
  log(`  requisições ao ledger:          ${load.requests}`);
  log(`  falhas do ledger:               ${load.failures}`);
  log(`  lançamentos registrados:        ${load.recorded}`);
  log(`  lançamentos consolidados:       ${(final?.entryCount ?? 0) - baseline.entryCount}`);
  log(`  créditos esperados no saldo:    ${expected.totalCreditsInCents}`);
  log(`  créditos no saldo consolidado:  ${final?.totalCreditsInCents ?? 'indisponível'}`);
};

const main = async () => {
  const baseline = await consolidatedBalance();
  if (baseline === null) {
    throw new Error('O consolidado precisa estar no ar antes do teste (docker compose up -d)');
  }
  log(`Saldo inicial de ${USERNAME} em ${today()}: ${baseline.entryCount} lançamentos`);
  log(`Gravando lançamentos a ${WRITE_RATE} req/s por ${TEST_DURATION}`);

  const loadRun = startLoad();
  await runOutage();
  const k6Exit = await loadRun;
  const load = await readLoadSummary();

  log('Aguardando o consolidado processar o que ficou na fila');
  const expected = {
    entryCount: baseline.entryCount + load.recorded,
    totalCreditsInCents: baseline.totalCreditsInCents + load.amount,
  };
  const final = await waitForBalance(expected);
  report({ load, baseline, expected, final });

  const passed = k6Exit === 0 && load.failures === 0 && final?.entryCount === expected.entryCount;
  log(passed ? 'APROVADO' : 'REPROVADO');
  process.exitCode = passed ? 0 : 1;
};

await main();
