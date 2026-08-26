import type { PrismaClient } from '../../generated/prisma/client';

type PrismaInstance = InstanceType<typeof PrismaClient>;
export type DatabaseDriver = 'pg' | 'neon';
export type DatabaseRuntime = 'node' | 'workerd';

interface DatabaseEnvironment extends Record<string, string | undefined> {
  DATABASE_URL?: string;
  DATABASE_DRIVER?: string;
  DATABASE_RUNTIME?: string;
}

export interface DatabaseRuntimeConfiguration {
  configured: boolean;
  driver: DatabaseDriver;
  runtime: DatabaseRuntime;
  connectionString?: string;
}

declare global {
  var __pulseBackPrismaPromise: Promise<PrismaInstance> | undefined;
}

export function resolveDatabaseRuntimeConfiguration(
  environment: DatabaseEnvironment = process.env,
): DatabaseRuntimeConfiguration {
  const connectionString = environment.DATABASE_URL?.trim();
  const configuredDriver = environment.DATABASE_DRIVER?.trim().toLowerCase();
  if (configuredDriver && configuredDriver !== 'pg' && configuredDriver !== 'neon') {
    throw new Error('DATABASE_DRIVER must be either pg or neon');
  }
  const driver: DatabaseDriver = configuredDriver === 'neon' ||
    (!configuredDriver && connectionString?.includes('neon.tech'))
    ? 'neon'
    : 'pg';
  const configuredRuntime = environment.DATABASE_RUNTIME?.trim().toLowerCase();
  if (configuredRuntime && configuredRuntime !== 'node' && configuredRuntime !== 'workerd') {
    throw new Error('DATABASE_RUNTIME must be either node or workerd');
  }
  const runtime: DatabaseRuntime = configuredRuntime === 'workerd' ||
    (!configuredRuntime && driver === 'neon')
    ? 'workerd'
    : 'node';
  if (runtime === 'workerd' && driver !== 'neon') {
    throw new Error('DATABASE_RUNTIME=workerd requires DATABASE_DRIVER=neon');
  }
  return {
    configured: Boolean(connectionString),
    driver,
    runtime,
    connectionString,
  };
}

export function databaseConfigured(environment: DatabaseEnvironment = process.env) {
  return resolveDatabaseRuntimeConfiguration(environment).configured;
}

async function createPrisma(): Promise<PrismaInstance> {
  const configuration = resolveDatabaseRuntimeConfiguration();
  if (!configuration.connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }
  const poolConfiguration = {
    connectionString: configuration.connectionString,
    max: process.env.NODE_ENV === 'production' ? 3 : 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  };
  const adapter = configuration.driver === 'neon'
    ? new (await import('@prisma/adapter-neon')).PrismaNeon(poolConfiguration)
    : new (await import('@prisma/adapter-pg')).PrismaPg({
        ...poolConfiguration,
        allowExitOnIdle: true,
      });

  return configuration.runtime === 'node'
    ? new (await import('../../generated/prisma-node/client')).PrismaClient({ adapter }) as unknown as PrismaInstance
    : new (await import('../../generated/prisma/client')).PrismaClient({ adapter });
}

export async function getPrisma(): Promise<PrismaInstance> {
  globalThis.__pulseBackPrismaPromise ??= createPrisma();
  try {
    return await globalThis.__pulseBackPrismaPromise;
  } catch (error) {
    globalThis.__pulseBackPrismaPromise = undefined;
    throw error;
  }
}

export function isTransientDatabaseReadError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { code?: unknown };
  return (
    candidate.code === 'P1001' ||
    candidate.code === 'P1017' ||
    /connection(?:\s+was)?\s+closed|connectionclosed/i.test(error.message)
  );
}

export async function retryDatabaseRead<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientDatabaseReadError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 75));
    return operation();
  }
}
