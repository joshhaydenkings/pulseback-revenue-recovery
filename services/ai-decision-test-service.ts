import { resolveRecoveryDecision } from "../lib/ai/decision-engine";
import { buildRecoveryDecisionContext } from "../lib/ai/recovery-decision-context";
import { getRecoveryRepository } from "../repositories/recovery-repository";
import {
  buildDeterministicDecision,
  guardianFor,
} from "./deterministic-recovery";

export type AIDecisionTestScenario =
  | "authentication_failure"
  | "insufficient_funds"
  | "bank_timeout"
  | "high_value_failure"
  | "exhausted_contact_limit"
  | "repeated_failure";

export async function analyzeAIDecisionTestScenario(
  scenario: AIDecisionTestScenario,
) {
  const policies = await getRecoveryRepository().getPolicies();
  const highValue = scenario === "high_value_failure";
  const fatigued = scenario === "exhausted_contact_limit";
  const repeated = scenario === "repeated_failure";
  const memory = {
    successfulPayments: 4,
    failedPayments: repeated ? 3 : 1,
    recoveryAttempts: repeated ? 2 : 0,
    contacts24h: fatigued ? policies.contactsPer24h : 0,
    contacts7d: fatigued ? policies.contactsPer7d : 1,
    previousRecoveries: 1,
    fatigueScore: fatigued ? 95 : 18,
    preferredMethod: "Card",
  };
  const deterministic = buildDeterministicDecision(scenario, memory);
  const context = buildRecoveryDecisionContext({
    transaction: {
      amountPaise: highValue ? 4_200_000 : 499_900,
      currency: "INR",
      paymentMethod: "Card",
      failureCategory: deterministic.failureCategory,
      failureReason: deterministic.diagnosis,
      errorSource: "bank",
      errorStep: "payment_authentication",
    },
    customer: {
      internalCustomerId: "ai_test_customer",
      ...memory,
    },
    recovery: {
      status: "ANALYZING",
      attempts: memory.recoveryAttempts,
      previousActions: repeated
        ? [{ type: "CREATE_PAYMENT_LINK", status: "FAILED" }]
        : [],
    },
    policies,
  });
  const analysis = await resolveRecoveryDecision(context, { useAI: true });
  const decision = {
    ...analysis.decision,
    riskFlags: [
      ...new Set([
        ...analysis.decision.riskFlags,
        ...context.risk.knownRiskFlags,
      ]),
    ],
  };
  const guardian = guardianFor(
    context.transaction.amountPaise,
    memory,
    decision,
    policies,
  );
  return {
    provider: analysis.provider,
    model: analysis.model,
    fallbackReason: analysis.fallbackReason,
    contextSummary: {
      amountPaise: context.transaction.amountPaise,
      failureCategory: context.transaction.failureCategory,
      priorSuccessfulPayments: context.customer.previousSuccessfulPayments,
      attempts: context.transaction.attemptCount,
      contacts24h: context.customer.contactsInLast24Hours,
      fatigueScore: context.customer.recoveryFatigueScore,
      operatingMode: context.merchantPolicySummary.operatingMode,
    },
    decision,
    guardian,
  };
}
