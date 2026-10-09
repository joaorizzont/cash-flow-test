import { setTimeout as sleep } from 'node:timers/promises';
import { compose, log, runK6 } from './compose.mjs';

const ALLOWED_SERVICES = ['redis', 'postgres-daily-balance', 'daily-balance-consumer', 'rabbitmq'];
const SERVICE = process.argv[2] ?? 'redis';
const OUTAGE_STARTS_AFTER_MS = 15_000;
const OUTAGE_MS = 30_000;

const main = async () => {
  if (!ALLOWED_SERVICES.includes(SERVICE)) {
    throw new Error(`Use one of: ${ALLOWED_SERVICES.join(', ')}`);
  }
  log(`Pico de 50 req/s no consolidado por 60 s; ${SERVICE} cai entre 15 s e 45 s`);
  const load = runK6({
    script: 'load/daily-balance-peak.js',
    summary: `outage-${SERVICE}`,
    env: { RATE: 50, DURATION: '60s' },
  });
  await sleep(OUTAGE_STARTS_AFTER_MS);
  log(`Derrubando ${SERVICE}`);
  await compose(['stop', SERVICE], { quiet: true });
  await sleep(OUTAGE_MS);
  log(`Religando ${SERVICE}`);
  await compose(['up', '-d', '--wait', SERVICE], { quiet: true });
  const exitCode = await load;
  log(exitCode === 0 ? 'APROVADO: limites do requisito respeitados' : 'REPROVADO');
  process.exitCode = exitCode;
};

await main();
