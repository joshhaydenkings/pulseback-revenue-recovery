import {
  databaseConfigured,
  getPrisma,
  resolveDatabaseRuntimeConfiguration,
} from '../lib/db/prisma';

export interface DatabaseHealthStatus {
  provider: 'PostgreSQL';
  status: 'connected' | 'demo' | 'unavailable';
  configured: boolean;
  driver: 'pg' | 'neon';
  runtime: 'node' | 'workerd';
  lastRecoveryAt?: string;
}

export async function getDatabaseHealthStatus(): Promise<DatabaseHealthStatus> {
  let configuration;
  try {
    configuration = resolveDatabaseRuntimeConfiguration();
  } catch (error) {
    console.error('[PulseBack:database-configuration]', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return {
      provider: 'PostgreSQL',
      status: 'unavailable',
      configured: Boolean(process.env.DATABASE_URL),
      driver: process.env.DATABASE_DRIVER === 'neon' ? 'neon' : 'pg',
      runtime: process.env.DATABASE_RUNTIME === 'workerd' ? 'workerd' : 'node',
    };
  }
  const base = {
    provider: 'PostgreSQL' as const,
    configured: configuration.configured,
    driver: configuration.driver,
    runtime: configuration.runtime,
  };
  if (!databaseConfigured()) {
    return {
      ...base,
      status: process.env.DEMO_MODE === 'true' ? 'demo' : 'unavailable',
    };
  }
  try {
    const prisma = await getPrisma();
    const [, lastRecovery] = await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      prisma.recoveryCase.findFirst({
        where: { status: { in: ['RECOVERED', 'SELF_RECOVERED'] } },
        orderBy: { recoveredAt: 'desc' },
        select: { recoveredAt: true, updatedAt: true },
      }),
    ]);
    return {
      ...base,
      status: 'connected',
      lastRecoveryAt: (
        lastRecovery?.recoveredAt ?? lastRecovery?.updatedAt
      )?.toISOString(),
    };
  } catch (error) {
    console.error('[PulseBack:database-health]', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return { ...base, status: 'unavailable' };
  }
}
