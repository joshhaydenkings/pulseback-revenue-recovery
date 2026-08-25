import type { RecoveryStatus } from './types';

export const VALID_TRANSITIONS: Record<RecoveryStatus, RecoveryStatus[]> = {
  DETECTED:['PENDING_OBSERVATION','ANALYZING','STOPPED'], PENDING_OBSERVATION:['ANALYZING','SELF_RECOVERED','STOPPED'], ANALYZING:['PLAN_READY','FAILED'],
  PLAN_READY:['AWAITING_APPROVAL','SCHEDULED','ACTION_IN_PROGRESS','STOPPED','ESCALATED'], AWAITING_APPROVAL:['SCHEDULED','ACTION_IN_PROGRESS','STOPPED','ESCALATED'],
  SCHEDULED:['ACTION_IN_PROGRESS','SELF_RECOVERED','STOPPED'], ACTION_IN_PROGRESS:['RECOVERING','ESCALATED','FAILED'], RECOVERING:['RECOVERED','SELF_RECOVERED','ESCALATED','STOPPED','FAILED'],
  RECOVERED:[], SELF_RECOVERED:[], ESCALATED:['AWAITING_APPROVAL','STOPPED','RECOVERING'], STOPPED:[], FAILED:['ESCALATED','STOPPED']
};
export class InvalidTransitionError extends Error { constructor(from: RecoveryStatus, to: RecoveryStatus) { super(`Invalid recovery transition: ${from} → ${to}`); } }
export function transitionRecovery(from: RecoveryStatus, to: RecoveryStatus) { if (!VALID_TRANSITIONS[from].includes(to)) throw new InvalidTransitionError(from,to); return to; }
