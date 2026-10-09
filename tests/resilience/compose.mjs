import { spawn } from 'node:child_process';

export const log = (message) => {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${message}\n`);
};

export const compose = (args, { quiet = false } = {}) =>
  new Promise((resolve) => {
    const child = spawn('docker', ['compose', ...args], { stdio: quiet ? 'ignore' : 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
  });

export const runK6 = ({ script, summary, env = {} }) =>
  compose([
    'run',
    '--rm',
    ...Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`]),
    'k6',
    'run',
    '--quiet',
    `--summary-export=/results/${summary}.json`,
    `/scripts/${script}`,
  ]);
