export const RECOVERY_STATUSES = [
  "DETECTED",
  "PENDING_OBSERVATION",
  "ANALYZING",
  "PLAN_READY",
  "AWAITING_APPROVAL",
  "SCHEDULED",
  "ACTION_IN_PROGRESS",
  "RECOVERING",
  "RECOVERED",
  "SELF_RECOVERED",
  "ESCALATED",
  "STOPPED",
  "FAILED",
] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];
export type FailureCategory =
  | "AUTHENTICATION"
  | "INSUFFICIENT_FUNDS"
  | "BANK_NETWORK"
  | "CUSTOMER_ABANDONMENT"
  | "SUBSCRIPTION_FAILURE"
  | "UNKNOWN";
export type RecoveryActionType =
  | "OBSERVE"
  | "WAIT"
  | "CREATE_PAYMENT_LINK"
  | "SEND_EMAIL_REMINDER"
  | "SEND_SMS_REMINDER"
  | "RETRY_RECOMMENDATION"
  | "REQUEST_MERCHANT_APPROVAL"
  | "ESCALATE"
  | "STOP";
export type OperatingMode = "SHADOW" | "APPROVAL" | "AUTOPILOT";
export type GuardianDecision = "APPROVED" | "APPROVAL_REQUIRED" | "BLOCKED";

export interface CustomerMemory {
  successfulPayments: number;
  failedPayments: number;
  recoveryAttempts: number;
  contacts24h: number;
  contacts7d: number;
  previousRecoveries: number;
  fatigueScore: number;
  preferredMethod?: string;
  lastContactAt?: string;
}

export interface RecoveryDecision {
  diagnosis: string;
  failureCategory: FailureCategory;
  recommendedAction:
    | "OBSERVE"
    | "WAIT"
    | "CREATE_PAYMENT_LINK"
    | "SEND_REMINDER"
    | "RETRY_RECOMMENDATION"
    | "ESCALATE"
    | "STOP";
  confidence: number;
  estimatedRecoveryProbability: number;
  merchantExplanation: string;
  supportingEvidence: string[];
  waitMinutes?: number;
  riskFlags: string[];
}

export interface RecoveryCase {
  id: string;
  paymentId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  amountPaise: number;
  currency: "INR";
  paymentMethod: string;
  status: RecoveryStatus;
  failureCategory: FailureCategory;
  failureDescription: string;
  opportunityScore: number;
  predictedRecoveryProbability: number;
  expectedRecoverableValuePaise: number;
  currentStrategy: RecoveryActionType;
  attempts: number;
  recoveredAmountPaise: number;
  riskFlags: string[];
  createdAt: string;
  nextActionAt?: string;
  activePaymentLinkId?: string;
  operatingMode: OperatingMode;
  memory: CustomerMemory;
  decision: RecoveryDecision;
  guardianDecision: GuardianDecision;
  guardianReasons: string[];
  timeline: TimelineEvent[];
  provenance?: "RAZORPAY_TEST" | "PULSEBACK_DEMO" | "SYNTHETIC_BENCHMARK";
  activePaymentLinkUrl?: string;
}

export interface TimelineEvent {
  id: string;
  time: string;
  actor:
    | "RAZORPAY"
    | "PULSEBACK_AI"
    | "GUARDIAN"
    | "SYSTEM"
    | "MERCHANT"
    | "CUSTOMER"
    | "SIMULATOR";
  title: string;
  description?: string;
  kind: "neutral" | "success" | "warning" | "danger" | "ai";
  metadata?: Record<string, unknown>;
}

export interface GuardianPolicies {
  operatingMode: OperatingMode;
  autonomousAmountThresholdPaise: number;
  observationWindowMinutes: number;
  maxAttemptsPerCase: number;
  contactsPer24h: number;
  contactsPer7d: number;
  minimumConfidence: number;
  highRiskAutoStop: boolean;
  newCustomerApprovalThresholdPaise: number;
  preventRepeatedAction: boolean;
  fatigueStopThreshold: number;
}

export const DEFAULT_POLICIES: GuardianPolicies = {
  operatingMode: "AUTOPILOT",
  autonomousAmountThresholdPaise: 2_500_000,
  observationWindowMinutes: 12,
  maxAttemptsPerCase: 3,
  contactsPer24h: 2,
  contactsPer7d: 4,
  minimumConfidence: 0.7,
  highRiskAutoStop: true,
  newCustomerApprovalThresholdPaise: 1_000_000,
  preventRepeatedAction: true,
  fatigueStopThreshold: 80,
};
