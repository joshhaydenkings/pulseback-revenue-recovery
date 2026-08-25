import type { PrismaClient } from '../../generated/prisma/client';

type PrismaInstance = InstanceType<typeof PrismaClient>;

declare global {
  var __pulseBackPrisma: PrismaInstance | undefined;
}

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export async function getPrisma(): Promise<PrismaInstance> {
  if (globalThis.__pulseBackPrisma) return globalThis.__pulseBackPrisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');

  const useNeon = process.env.DATABASE_DRIVER === 'neon' || connectionString.includes('neon.tech');
  const useNodeClient = process.env.DATABASE_RUNTIME === 'node';
  const adapter = useNeon
    ? new (await import('@prisma/adapter-neon')).PrismaNeon({ connectionString })
    : new (await import('@prisma/adapter-pg')).PrismaPg({ connectionString });

  const client = useNodeClient
    ? new (await import('../../generated/prisma-node/client')).PrismaClient({ adapter }) as unknown as PrismaInstance
    : new (await import('../../generated/prisma/client')).PrismaClient({ adapter });
  if (process.env.NODE_ENV !== 'production') globalThis.__pulseBackPrisma = client;
  return client;
}
