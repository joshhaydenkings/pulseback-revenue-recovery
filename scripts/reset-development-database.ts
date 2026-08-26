import { spawn } from 'node:child_process';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required for a development reset');
}
const target = new URL(connectionString);
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
if (process.env.NODE_ENV === 'production' || !localHosts.has(target.hostname)) {
  throw new Error(
    'Refusing to reset a non-local database. Use db:deploy for hosted databases.',
  );
}

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(executable, ['prisma', 'migrate', 'reset', '--force'], {
  stdio: 'inherit',
  shell: false,
});

await new Promise<void>((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`Prisma reset exited with code ${code ?? 'unknown'}`));
  });
});
