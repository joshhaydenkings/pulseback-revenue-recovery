import type {
  FailureCategory,
  GuardianPolicies,
  RecoveryStatus,
} from "../../domain/recovery/types";

export interface RecoveryDecisionContext {
  transaction: {
    amountPaise: number;
    currency: string;
    paymentMethod: string;
    failureCategory: FailureCategory;
    failureReason: string;
    errorSource?: string;
    errorStep?: string;
    attemptCount: number;
    timeSinceFailureMinutes: number;
  };
  customer: {
    internalCustomerId: string;
    previousSuccessfulPayments: number;
    previousFailedPayments: number;
    previousSuccessfulRecoveries: number;
    contactsInLast24Hours: number;
    contactsInLast7Days: number;
    recoveryFatigueScore: number;
    lastContactMinutesAgo: number | null;
    knownSuccessfulPaymentMethods: string[];
  };
  recovery: {
    currentStatus: RecoveryStatus;
    previousActions: Array<{ type: string; status: string }>;
    activePaymentLinkExists: boolean;
    observationWindowState: "NOT_STARTED" | "ACTIVE" | "COMPLETE";
    currentAttemptNumber: number;
  };
  merchantPolicySummary: {
    autonomousTransactionThresholdPaise: number;
    maximumAttempts: number;
    contactLimit24Hours: number;
    contactLimit7Days: number;
    minimumConfidence: number;
    operatingMode: GuardianPolicies["operatingMode"];
    highRiskAutoStop: boolean;
  };
  risk: {
    knownRiskFlags: string[];
    suspiciousInstructionLikeMetadata: boolean;
  };
}

export interface RecoveryContextSource {
  transaction: {
    amountPaise: number;
    currency?: string;
    paymentMethod?: string;
    failureCategory: FailureCategory;
    failureReason?: string;
    errorSource?: string;
    errorStep?: string;
    failedAt?: Date | string;
  };
  customer: {
    internalCustomerId: string;
    successfulPayments: number;
    failedPayments: number;
    previousRecoveries: number;
    contacts24h: number;
    contacts7d: number;
    fatigueScore: number;
    lastContactAt?: Date | string | null;
    preferredMethod?: string;
  };
  recovery: {
    status: RecoveryStatus;
    attempts: number;
    previousActions?: Array<{ type: string; status: string }>;
    activePaymentLinkId?: string | null;
    nextActionAt?: Date | string | null;
  };
  policies: GuardianPolicies;
  riskFlags?: string[];
  now?: Date;
}

const instructionPattern =
  /ignore\s+(all\s+)?previous|system\s+prompt|developer\s+message|approve\s+this|send\s+money|reveal\s+(the\s+)?secret|api[_\s-]?key|webhook[_\s-]?secret|password|cvv|card\s*number/i;

function safeProviderText(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const compact = value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 240);
  if (instructionPattern.test(compact))
    return "Untrusted instruction-like provider metadata was omitted";
  return compact
    .replace(/\b\d{12,19}\b/g, "[payment-number-redacted]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[identifier-redacted]");
}

function minutesSince(value: Date | string | null | undefined, now: Date) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
}

export function containsInstructionLikeMetadata(values: unknown[]) {
  return values.some(
    (value) => typeof value === "string" && instructionPattern.test(value),
  );
}

export function buildRecoveryDecisionContext(
  source: RecoveryContextSource,
): RecoveryDecisionContext {
  const now = source.now ?? new Date();
  const suspicious = containsInstructionLikeMetadata([
    source.transaction.failureReason,
    source.transaction.errorSource,
    source.transaction.errorStep,
  ]);
  const riskFlags = [...new Set(source.riskFlags ?? [])];
  if (suspicious && !riskFlags.includes("INSTRUCTION_LIKE_PROVIDER_METADATA"))
    riskFlags.push("INSTRUCTION_LIKE_PROVIDER_METADATA");
  const failedMinutes = minutesSince(source.transaction.failedAt, now) ?? 0;
  const nextAction = source.recovery.nextActionAt
    ? new Date(source.recovery.nextActionAt)
    : undefined;
  const observationWindowState = source.recovery.nextActionAt
    ? nextAction && nextAction.getTime() > now.getTime()
      ? "ACTIVE"
      : "COMPLETE"
    : "NOT_STARTED";
  const paymentMethod = safeProviderText(
    source.transaction.paymentMethod,
    "unknown",
  ).replace(/\d/g, "•");

  return {
    transaction: {
      amountPaise: source.transaction.amountPaise,
      currency: source.transaction.currency ?? "INR",
      paymentMethod,
      failureCategory: source.transaction.failureCategory,
      failureReason: safeProviderText(
        source.transaction.failureReason,
        "Provider supplied no detailed failure reason",
      ),
      errorSource: source.transaction.errorSource
        ? safeProviderText(source.transaction.errorSource, "unknown")
        : undefined,
      errorStep: source.transaction.errorStep
        ? safeProviderText(source.transaction.errorStep, "unknown")
        : undefined,
      attemptCount: source.recovery.attempts,
      timeSinceFailureMinutes: failedMinutes,
    },
    customer: {
      internalCustomerId: source.customer.internalCustomerId
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 80),
      previousSuccessfulPayments: source.customer.successfulPayments,
      previousFailedPayments: source.customer.failedPayments,
      previousSuccessfulRecoveries: source.customer.previousRecoveries,
      contactsInLast24Hours: source.customer.contacts24h,
      contactsInLast7Days: source.customer.contacts7d,
      recoveryFatigueScore: source.customer.fatigueScore,
      lastContactMinutesAgo: minutesSince(source.customer.lastContactAt, now),
      knownSuccessfulPaymentMethods: source.customer.preferredMethod
        ? [safeProviderText(source.customer.preferredMethod, "unknown").replace(/\d/g, "•")]
        : [],
    },
    recovery: {
      currentStatus: source.recovery.status,
      previousActions: (source.recovery.previousActions ?? [])
        .slice(-12)
        .map((action) => ({
          type: action.type.slice(0, 80),
          status: action.status.slice(0, 40),
        })),
      activePaymentLinkExists: Boolean(source.recovery.activePaymentLinkId),
      observationWindowState,
      currentAttemptNumber: source.recovery.attempts + 1,
    },
    merchantPolicySummary: {
      autonomousTransactionThresholdPaise:
        source.policies.autonomousAmountThresholdPaise,
      maximumAttempts: source.policies.maxAttemptsPerCase,
      contactLimit24Hours: source.policies.contactsPer24h,
      contactLimit7Days: source.policies.contactsPer7d,
      minimumConfidence: source.policies.minimumConfidence,
      operatingMode: source.policies.operatingMode,
      highRiskAutoStop: source.policies.highRiskAutoStop,
    },
    risk: {
      knownRiskFlags: riskFlags,
      suspiciousInstructionLikeMetadata: suspicious,
    },
  };
}
