import type { CustomerMemory, FailureCategory } from './types';

export interface OpportunityInputs { amountPaise: number; predictedProbability: number; failureCategory: FailureCategory; memory: CustomerMemory; attempts: number; hoursSinceFailure: number; riskFlags: string[]; likelySelfResolve: boolean; hasActiveLink: boolean; }
const categoryWeight: Record<FailureCategory, number> = { AUTHENTICATION:8, INSUFFICIENT_FUNDS:1, BANK_NETWORK:6, CUSTOMER_ABANDONMENT:4, SUBSCRIPTION_FAILURE:3, UNKNOWN:-4 };

export function calculateOpportunityScore(input: OpportunityInputs) {
  const amountValue = Math.min(15, Math.log10(Math.max(input.amountPaise / 100, 100)) * 5);
  const history = Math.min(10, input.memory.successfulPayments * 1.4) + Math.min(7, input.memory.previousRecoveries * 2);
  const probability = input.predictedProbability * 50;
  const attemptPenalty = input.attempts * 6;
  const fatiguePenalty = input.memory.fatigueScore * .18 + input.memory.contacts24h * 4;
  const riskPenalty = input.riskFlags.length * 12;
  const stalePenalty = Math.min(10, input.hoursSinceFailure / 12);
  const resolveAdjustment = input.likelySelfResolve ? -4 : 0;
  const linkPenalty = input.hasActiveLink ? 8 : 0;
  const raw = probability + amountValue + history + categoryWeight[input.failureCategory] - attemptPenalty - fatiguePenalty - riskPenalty - stalePenalty + resolveAdjustment - linkPenalty;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const adjustedProbability = Math.max(0, input.predictedProbability - input.attempts * .04 - input.memory.fatigueScore * .0015 - input.riskFlags.length * .08);
  return { score, expectedRecoverableValuePaise: Math.round(input.amountPaise * adjustedProbability), urgency: score >= 80 ? 'HIGH' : score >= 55 ? 'MEDIUM' : 'LOW', reason: score >= 80 ? 'High expected recoverable value with strong customer history' : score >= 55 ? 'Worth pursuing within contact and attempt limits' : 'Low incremental value or elevated customer friction' };
}
