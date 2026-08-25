import { evaluateGuardian } from '../domain/guardian/evaluate';
import { calculateOpportunityScore } from '../domain/recovery/opportunity-score';
import type { CustomerMemory, FailureCategory, GuardianPolicies, RecoveryDecision, RecoveryActionType } from '../domain/recovery/types';
import type { SimulatorEventType } from '../repositories/types';

const categoryByEvent: Record<SimulatorEventType, FailureCategory> = {
  authentication_failure: 'AUTHENTICATION',
  insufficient_funds: 'INSUFFICIENT_FUNDS',
  bank_timeout: 'BANK_NETWORK',
  late_authorization: 'BANK_NETWORK',
  payment_captured: 'UNKNOWN',
  payment_link_paid: 'UNKNOWN',
  payment_link_error: 'AUTHENTICATION',
  payment_link_expired: 'UNKNOWN',
  payment_link_cancelled: 'UNKNOWN',
  repeated_failure: 'SUBSCRIPTION_FAILURE',
  high_value_failure: 'AUTHENTICATION',
  exhausted_contact_limit: 'CUSTOMER_ABANDONMENT',
};

const descriptions: Record<FailureCategory, string> = {
  AUTHENTICATION: 'Payment authentication was not completed by the issuing bank',
  INSUFFICIENT_FUNDS: 'Issuer declined because the account balance was insufficient',
  BANK_NETWORK: 'Bank gateway timed out before returning a final status',
  CUSTOMER_ABANDONMENT: 'Customer left checkout before authorization completed',
  SUBSCRIPTION_FAILURE: 'Recurring mandate could not be charged',
  UNKNOWN: 'Provider returned an unclassified payment update',
};

export function failureCategoryFor(type: SimulatorEventType) {
  return categoryByEvent[type];
}

export function failureDescriptionFor(category: FailureCategory) {
  return descriptions[category];
}

export function buildDeterministicDecision(type: SimulatorEventType, memory: CustomerMemory): RecoveryDecision {
  const failureCategory = failureCategoryFor(type);
  const recommendedAction: RecoveryDecision['recommendedAction'] =
    type === 'exhausted_contact_limit' ? 'STOP'
      : type === 'bank_timeout' ? 'OBSERVE'
        : type === 'insufficient_funds' ? 'WAIT'
          : type === 'repeated_failure' ? 'RETRY_RECOMMENDATION'
            : 'CREATE_PAYMENT_LINK';
  const probability = failureCategory === 'AUTHENTICATION' ? .78
    : failureCategory === 'BANK_NETWORK' ? .72
      : failureCategory === 'INSUFFICIENT_FUNDS' ? .55
        : failureCategory === 'CUSTOMER_ABANDONMENT' ? .42 : .46;
  return {
    diagnosis: failureDescriptionFor(failureCategory),
    failureCategory,
    recommendedAction,
    confidence: type === 'exhausted_contact_limit' ? .96 : .88,
    estimatedRecoveryProbability: probability,
    merchantExplanation: type === 'exhausted_contact_limit'
      ? 'Contact fatigue has reached the configured safety boundary, so PulseBack will stop instead of contacting the customer again.'
      : failureCategory === 'BANK_NETWORK'
        ? 'The provider did not return a final state. PulseBack will observe first so a late authorization can self-resolve without customer contact.'
        : 'The failure evidence and customer history support a measured recovery action within the configured Guardian limits.',
    supportingEvidence: [
      `${memory.successfulPayments} previous successful payments`,
      `${memory.contacts24h} recovery contacts in 24 hours`,
      `Attempt ${memory.recoveryAttempts + 1}`,
    ],
    waitMinutes: recommendedAction === 'OBSERVE' ? 12 : recommendedAction === 'WAIT' ? 120 : undefined,
    riskFlags: [],
  };
}

export function actionTypeFor(decision: RecoveryDecision): RecoveryActionType {
  return decision.recommendedAction === 'SEND_REMINDER' ? 'SEND_EMAIL_REMINDER' : decision.recommendedAction;
}

export function scoreRecovery(amountPaise: number, decision: RecoveryDecision, memory: CustomerMemory) {
  return calculateOpportunityScore({
    amountPaise,
    predictedProbability: decision.estimatedRecoveryProbability,
    failureCategory: decision.failureCategory,
    memory,
    attempts: memory.recoveryAttempts,
    hoursSinceFailure: 0,
    riskFlags: decision.riskFlags,
    likelySelfResolve: decision.failureCategory === 'BANK_NETWORK',
    hasActiveLink: false,
  });
}

export function guardianFor(amountPaise: number, memory: CustomerMemory, decision: RecoveryDecision, policies: GuardianPolicies) {
  return evaluateGuardian({ amountPaise, attempts: memory.recoveryAttempts, riskFlags: decision.riskFlags, memory, activePaymentLinkId: undefined, operatingMode: policies.operatingMode }, decision, policies);
}
