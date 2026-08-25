import { getRecoveryRepository } from '../repositories/recovery-repository';
import type { RecoveryEventInput } from '../repositories/types';

export async function processRecoveryEvent(input: RecoveryEventInput) {
  return getRecoveryRepository().processEvent(input);
}
