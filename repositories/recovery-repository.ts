import { databaseConfigured } from '../lib/db/prisma';
import { MemoryRecoveryRepository } from './memory-recovery-repository';
import { PrismaRecoveryRepository } from './prisma-recovery-repository';
import type { RecoveryRepository } from './types';

declare global {
  var __pulseBackMemoryRepository: MemoryRecoveryRepository | undefined;
}

export function getRecoveryRepository(): RecoveryRepository {
  if (databaseConfigured()) return new PrismaRecoveryRepository();
  globalThis.__pulseBackMemoryRepository ??= new MemoryRecoveryRepository();
  return globalThis.__pulseBackMemoryRepository;
}
