import nextEnv from '@next/env';
import { databaseConfigured, getPrisma } from '../lib/db/prisma';

nextEnv.loadEnvConfig(process.cwd());

if (!databaseConfigured()) {
  throw new Error('DATABASE_URL is required for database verification');
}

const prisma = await getPrisma();
const [, merchants, cases, auditEvents] = await Promise.all([
  prisma.$queryRaw`SELECT 1`,
  prisma.merchant.count(),
  prisma.recoveryCase.count(),
  prisma.auditEvent.count(),
]);

console.log(
  JSON.stringify(
    {
      database: 'reachable',
      schema: 'compatible',
      merchants,
      recoveryCases: cases,
      auditEvents,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
