import type { GuardianPolicies, RecoveryCase } from '../domain/recovery/types';
import type { EvaluationResult } from '../domain/evaluation/simulator';

export type SimulatorEventType =
  | 'authentication_failure'
  | 'insufficient_funds'
  | 'bank_timeout'
  | 'late_authorization'
  | 'payment_captured'
  | 'payment_link_paid'
  | 'payment_link_error'
  | 'repeated_failure'
  | 'high_value_failure'
  | 'exhausted_contact_limit';

export interface RecoveryEventInput {
  provider: string;
  providerEventId: string;
  type: SimulatorEventType;
  providerPaymentId?: string;
  caseId?: string;
  amountPaise?: number;
  customerName?: string;
  customerEmail?: string;
  paymentMethod?: string;
  payload?: Record<string, unknown>;
  injectProviderFailure?: boolean;
}

export interface RecoveryEventResult {
  ok: true;
  duplicate: boolean;
  eventId: string;
  caseId?: string;
  message: string;
}

export type CaseCommand = 'approve' | 'reject' | 'stop' | 'run' | 'escalate';

export interface CaseCommandResult {
  ok: true;
  case: RecoveryCase;
  message: string;
  paymentLinkUrl?: string;
  reused?: boolean;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  actor: string;
  caseId: string;
  event: string;
  outcome: string;
  message: string;
  metadata: unknown;
}

export interface DashboardSnapshot {
  revenueAtRiskPaise: number;
  revenueRecoveredPaise: number;
  recoveryRate: number;
  activeRecoveries: number;
  selfRecoveredPaise: number;
  selfRecoveredCount: number;
  needsApproval: number;
  needsApprovalPaise: number;
  expectedRecoveryPaise: number;
  recoveredCount: number;
  opportunityQueue: RecoveryCase[];
  recentActivity: AuditRecord[];
  pulse: Array<{ date: string; atRisk: number; recovered: number }>;
  effectiveness: Array<{ strategy: string; recovered: number }>;
}

export interface EvaluationRunSummary {
  id: string;
  seed: string;
  caseCount: number;
  revenueAtRiskPaise: number;
  baselineRecoveredPaise: number;
  pulseBackRecoveredPaise: number;
  createdAt: string;
}

export interface DueActionResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface RecoveryRepository {
  readonly kind: 'postgresql' | 'demo-memory';
  listCases(): Promise<RecoveryCase[]>;
  getCase(id: string): Promise<RecoveryCase | undefined>;
  listAuditEvents(): Promise<AuditRecord[]>;
  getPolicies(): Promise<GuardianPolicies>;
  savePolicies(policies: GuardianPolicies, actor?: string): Promise<GuardianPolicies>;
  processEvent(input: RecoveryEventInput): Promise<RecoveryEventResult>;
  runCaseCommand(caseId: string, command: CaseCommand, reason?: string): Promise<CaseCommandResult>;
  processDueActions(now?: Date): Promise<DueActionResult>;
  getDashboard(): Promise<DashboardSnapshot>;
  saveEvaluation(result: EvaluationResult): Promise<EvaluationRunSummary>;
  listEvaluationRuns(limit?: number): Promise<EvaluationRunSummary[]>;
}
