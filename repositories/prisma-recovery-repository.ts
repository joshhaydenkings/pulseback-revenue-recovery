import { Prisma } from '../generated/prisma/client';
import type { EvaluationResult } from '../domain/evaluation/simulator';
import type { CustomerMemory, GuardianPolicies, RecoveryCase, TimelineEvent } from '../domain/recovery/types';
import { DEFAULT_POLICIES } from '../domain/recovery/types';
import { getPrisma } from '../lib/db/prisma';
import { actionTypeFor, buildDeterministicDecision, failureDescriptionFor, guardianFor, scoreRecovery } from '../services/deterministic-recovery';
import type { CaseCommand, CaseCommandResult, DashboardSnapshot, DueActionResult, EvaluationRunSummary, RecoveryEventInput, RecoveryEventResult, RecoveryRepository } from './types';

const merchantId = 'merchant_demo';
const activeStatuses = new Set(['DETECTED', 'PENDING_OBSERVATION', 'ANALYZING', 'PLAN_READY', 'AWAITING_APPROVAL', 'SCHEDULED', 'ACTION_IN_PROGRESS', 'RECOVERING']);
const caseInclude = {
  customer: true,
  payment: true,
  merchant: true,
  decisions: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  actions: { orderBy: { createdAt: 'desc' as const } },
  auditEvents: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.RecoveryCaseInclude;
type CaseRecord = Prisma.RecoveryCaseGetPayload<{ include: typeof caseInclude }>;

function jsonStrings(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
function cleanId(value: string) { return value.replace(/[^a-zA-Z0-9]/g, '').slice(-14); }
function auditKind(eventType: string): TimelineEvent['kind'] {
  if (eventType.includes('FAILED')) return 'danger';
  if (eventType.includes('APPROVED') || eventType.includes('RECOVERED') || eventType.includes('CREATED') || eventType.includes('EXECUTED')) return 'success';
  if (eventType.includes('GUARDIAN') || eventType.includes('STOP') || eventType.includes('ESCALAT')) return 'warning';
  if (eventType.includes('DIAGNOSIS') || eventType.includes('AUTOPSY')) return 'ai';
  return 'neutral';
}
function actor(value: string): TimelineEvent['actor'] {
  return ['RAZORPAY', 'PULSEBACK_AI', 'GUARDIAN', 'SYSTEM', 'MERCHANT', 'CUSTOMER', 'SIMULATOR'].includes(value) ? value as TimelineEvent['actor'] : 'SYSTEM';
}
function toDomain(record: CaseRecord): RecoveryCase {
  const latest = record.decisions[0];
  const recoveryAttempts = record.attempts;
  const memory: CustomerMemory = {
    successfulPayments: record.customer.totalSuccessfulPayments,
    failedPayments: record.customer.totalFailedPayments,
    recoveryAttempts,
    contacts24h: 0,
    contacts7d: 0,
    previousRecoveries: Math.min(record.customer.totalSuccessfulPayments, 3),
    fatigueScore: record.customer.recoveryFatigueScore,
    preferredMethod: record.payment.paymentMethod,
    lastContactAt: record.customer.lastContactAt?.toISOString(),
  };
  const fallback = buildDeterministicDecision('authentication_failure', memory);
  const decision = latest ? {
    diagnosis: record.diagnosis,
    failureCategory: record.failureCategory as RecoveryCase['failureCategory'],
    recommendedAction: latest.recommendedAction as RecoveryCase['decision']['recommendedAction'],
    confidence: latest.confidence,
    estimatedRecoveryProbability: latest.estimatedRecoveryProbability,
    merchantExplanation: latest.merchantExplanation,
    supportingEvidence: jsonStrings(latest.supportingEvidence),
    riskFlags: jsonStrings(latest.riskFlags),
  } : fallback;
  return {
    id: record.id,
    paymentId: record.payment.providerPaymentId,
    customerId: record.customerId,
    customerName: record.customer.name,
    customerEmail: record.customer.email,
    amountPaise: record.payment.amount,
    currency: 'INR',
    paymentMethod: record.payment.paymentMethod,
    status: record.status,
    failureCategory: record.failureCategory as RecoveryCase['failureCategory'],
    failureDescription: record.payment.failureDescription ?? record.diagnosis,
    opportunityScore: record.opportunityScore,
    predictedRecoveryProbability: record.predictedRecoveryProbability,
    expectedRecoverableValuePaise: record.expectedRecoverableValue,
    currentStrategy: record.currentStrategy as RecoveryCase['currentStrategy'],
    attempts: record.attempts,
    recoveredAmountPaise: record.recoveredAmount,
    riskFlags: latest ? jsonStrings(latest.riskFlags) : [],
    createdAt: record.createdAt.toISOString(),
    nextActionAt: record.nextActionAt?.toISOString(),
    activePaymentLinkId: record.activePaymentLinkId ?? undefined,
    operatingMode: record.merchant.operatingMode,
    memory,
    decision,
    guardianDecision: (latest?.guardianDecision ?? 'APPROVAL_REQUIRED') as RecoveryCase['guardianDecision'],
    guardianReasons: latest ? jsonStrings(latest.guardianReasons) : [],
    timeline: record.auditEvents.map(event => ({ id: event.id, time: event.createdAt.toISOString(), actor: actor(event.actor), title: event.eventType.replaceAll('_', ' '), description: event.message, kind: auditKind(event.eventType), metadata: event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : undefined })),
  };
}

export class PrismaRecoveryRepository implements RecoveryRepository {
  readonly kind = 'postgresql' as const;

  async listCases() {
    const prisma = await getPrisma();
    const rows = await prisma.recoveryCase.findMany({ where: { merchantId }, include: caseInclude, orderBy: [{ opportunityScore: 'desc' }, { createdAt: 'desc' }] });
    return rows.map(toDomain);
  }
  async getCase(id: string) {
    const prisma = await getPrisma();
    const row = await prisma.recoveryCase.findUnique({ where: { id }, include: caseInclude });
    return row ? toDomain(row) : undefined;
  }
  async listAuditEvents() {
    const prisma = await getPrisma();
    const rows = await prisma.auditEvent.findMany({ where: { merchantId }, orderBy: { createdAt: 'desc' }, take: 500 });
    return rows.map(event => ({ id: event.id, timestamp: event.createdAt.toISOString(), actor: event.actor, caseId: event.recoveryCaseId ?? '—', event: event.eventType.replaceAll('_', ' '), outcome: event.eventType.includes('FAILED') ? 'Needs review' : event.eventType.includes('RECOVERED') || event.eventType.includes('EXECUTED') ? 'Completed' : 'Recorded', message: event.message, metadata: event.metadata }));
  }
  async getPolicies() {
    const prisma = await getPrisma();
    const policy = await prisma.policy.findUnique({ where: { merchantId } });
    return policy ? {
      operatingMode: policy.operatingMode,
      autonomousAmountThresholdPaise: policy.autonomousAmountThresholdPaise,
      observationWindowMinutes: policy.observationWindowMinutes,
      maxAttemptsPerCase: policy.maxAttemptsPerCase,
      contactsPer24h: policy.contactsPer24h,
      contactsPer7d: policy.contactsPer7d,
      minimumConfidence: policy.minimumConfidence,
      highRiskAutoStop: policy.highRiskAutoStop,
      newCustomerApprovalThresholdPaise: policy.newCustomerApprovalThresholdPaise,
      preventRepeatedAction: policy.preventRepeatedAction,
      fatigueStopThreshold: policy.fatigueStopThreshold,
    } : { ...DEFAULT_POLICIES };
  }
  async savePolicies(policies: GuardianPolicies, actorName = 'MERCHANT') {
    const prisma = await getPrisma();
    await prisma.$transaction(async tx => {
      const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId } });
      await tx.policy.upsert({
        where: { merchantId },
        create: { id: `policy_${merchantId}`, merchantId, ...policies },
        update: policies,
      });
      await tx.merchant.update({ where: { id: merchantId }, data: { operatingMode: policies.operatingMode, autonomousAmountThreshold: policies.autonomousAmountThresholdPaise, observationWindowMinutes: policies.observationWindowMinutes } });
      await tx.auditEvent.create({ data: { id: crypto.randomUUID(), merchantId, category: 'POLICY', eventType: merchant.operatingMode === policies.operatingMode ? 'POLICY_UPDATED' : 'OPERATING_MODE_CHANGED', actor: actorName, message: merchant.operatingMode === policies.operatingMode ? 'Guardian policy configuration updated.' : `Operating mode changed from ${merchant.operatingMode} to ${policies.operatingMode}.`, metadata: policies as unknown as Prisma.InputJsonValue } });
    });
    return policies;
  }

  async processEvent(input: RecoveryEventInput): Promise<RecoveryEventResult> {
    const prisma = await getPrisma();
    try {
      return await prisma.$transaction(async tx => {
        await tx.webhookEvent.create({ data: { id: crypto.randomUUID(), provider: input.provider, providerEventId: input.providerEventId, eventType: input.type, payload: (input.payload ?? input) as Prisma.InputJsonValue } });
        const existing = input.caseId
          ? await tx.recoveryCase.findUnique({ where: { id: input.caseId }, include: caseInclude })
          : input.providerPaymentId
            ? await tx.recoveryCase.findFirst({ where: { payment: { providerPaymentId: input.providerPaymentId } }, include: caseInclude })
            : null;

        if (input.type === 'late_authorization' || input.type === 'payment_captured') {
          if (!existing) {
            await tx.webhookEvent.update({ where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } }, data: { processedAt: new Date() } });
            return { ok: true, duplicate: false, eventId: input.providerEventId, message: 'Payment update persisted; no active recovery case matched.' };
          }
          if (activeStatuses.has(existing.status)) {
            await tx.recoveryAction.updateMany({ where: { recoveryCaseId: existing.id, status: { in: ['PENDING', 'SCHEDULED', 'APPROVED'] } }, data: { status: 'CANCELLED', errorCode: 'LATE_AUTHORIZATION', errorMessage: 'Cancelled before customer contact.' } });
            await tx.recoveryCase.update({ where: { id: existing.id }, data: { status: 'SELF_RECOVERED', recoveredAmount: existing.payment.amount, recoveredAt: new Date(), nextActionAt: null } });
            await tx.payment.update({ where: { id: existing.paymentId }, data: { status: 'authorized' } });
            await this.createAudit(tx, existing.id, 'RECOVERY', 'LATE_AUTHORIZATION', 'RAZORPAY', 'Payment authorized during observation. Pending recovery was cancelled before customer contact.', { recoveredAmountPaise: existing.payment.amount });
          }
          await tx.webhookEvent.update({ where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } }, data: { processedAt: new Date() } });
          return { ok: true, duplicate: false, eventId: input.providerEventId, caseId: existing.id, message: 'Late Authorization Guard persisted self-recovery and cancelled pending actions.' };
        }
        if (input.type === 'payment_link_paid') {
          if (!existing) return { ok: true, duplicate: false, eventId: input.providerEventId, message: 'Payment Link update persisted; no recovery case matched.' };
          await tx.recoveryCase.update({ where: { id: existing.id }, data: { status: 'RECOVERED', recoveredAmount: existing.payment.amount, recoveredAt: new Date(), nextActionAt: null } });
          await tx.payment.update({ where: { id: existing.paymentId }, data: { status: 'captured' } });
          await tx.recoveryAction.updateMany({ where: { recoveryCaseId: existing.id, type: 'CREATE_PAYMENT_LINK' }, data: { status: 'SUCCEEDED', executedAt: new Date() } });
          await this.createAudit(tx, existing.id, 'RECOVERY', 'PAYMENT_RECOVERED', 'CUSTOMER', 'Simulated Payment Link paid; recovery completed.', { recoveredAmountPaise: existing.payment.amount });
          await tx.webhookEvent.update({ where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } }, data: { processedAt: new Date() } });
          return { ok: true, duplicate: false, eventId: input.providerEventId, caseId: existing.id, message: 'Recovery case marked RECOVERED.' };
        }
        if (input.type === 'payment_link_error' && existing) {
          await tx.recoveryAction.updateMany({ where: { recoveryCaseId: existing.id, status: { in: ['PENDING', 'SCHEDULED', 'APPROVED'] } }, data: { status: 'FAILED', executedAt: new Date(), errorCode: 'SIMULATED_PROVIDER_UNAVAILABLE', errorMessage: 'Mock provider failure' } });
          await tx.recoveryCase.update({ where: { id: existing.id }, data: { status: 'ESCALATED', nextActionAt: null } });
          await this.createAudit(tx, existing.id, 'ACTION', 'ACTION_FAILED', 'SYSTEM', 'Mock provider action failed. No duplicate action was created; case escalated.', { simulated: true });
          await tx.webhookEvent.update({ where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } }, data: { processedAt: new Date() } });
          return { ok: true, duplicate: false, eventId: input.providerEventId, caseId: existing.id, message: 'Provider failure handled safely and case escalated.' };
        }

        const policies = await this.getPoliciesInTransaction(tx);
        const amountPaise = input.amountPaise ?? (input.type === 'high_value_failure' ? 4_200_000 : 499_900);
        const suffix = cleanId(input.providerEventId) || String(Date.now());
        const caseId = `RC-${suffix}`;
        const customerId = `cust_sim_${suffix}`;
        const paymentId = `payment_sim_${suffix}`;
        const memory: CustomerMemory = { successfulPayments: 4, failedPayments: 1, recoveryAttempts: input.type === 'repeated_failure' ? 2 : 0, contacts24h: input.type === 'exhausted_contact_limit' ? policies.contactsPer24h : 0, contacts7d: input.type === 'exhausted_contact_limit' ? policies.contactsPer7d : 1, previousRecoveries: 1, fatigueScore: input.type === 'exhausted_contact_limit' ? 95 : 18, preferredMethod: input.paymentMethod ?? 'Card •••• 4408' };
        const decision = buildDeterministicDecision(input.type, memory);
        const scored = scoreRecovery(amountPaise, decision, memory);
        const guardian = guardianFor(amountPaise, memory, decision, policies);
        const actionType = actionTypeFor(decision);
        const status = decision.recommendedAction === 'STOP' || guardian.decision === 'BLOCKED' ? 'STOPPED'
          : policies.operatingMode === 'SHADOW' ? 'PLAN_READY'
            : guardian.decision === 'APPROVAL_REQUIRED' || policies.operatingMode === 'APPROVAL' ? 'AWAITING_APPROVAL'
              : decision.recommendedAction === 'OBSERVE' ? 'PENDING_OBSERVATION' : 'SCHEDULED';
        const scheduledFor = ['SCHEDULED', 'PENDING_OBSERVATION'].includes(status) ? new Date(Date.now() + (decision.waitMinutes ?? 0) * 60_000) : null;
        await tx.customer.create({ data: { id: customerId, merchantId, externalCustomerId: `sim_${suffix}`, name: input.customerName ?? (input.type === 'high_value_failure' ? 'Aarav Mehta' : 'Demo Customer'), email: input.customerEmail ?? 'demo.customer@example.com', totalSuccessfulPayments: memory.successfulPayments, totalFailedPayments: memory.failedPayments, recoveryFatigueScore: memory.fatigueScore } });
        await tx.payment.create({ data: { id: paymentId, merchantId, customerId, provider: input.provider, providerPaymentId: input.providerPaymentId ?? `pay_sim_${suffix}`, amount: amountPaise, currency: 'INR', paymentMethod: input.paymentMethod ?? 'Card •••• 4408', status: 'failed', failureCode: decision.failureCategory, failureDescription: failureDescriptionFor(decision.failureCategory) } });
        await tx.recoveryCase.create({ data: { id: caseId, merchantId, customerId, paymentId, status, failureCategory: decision.failureCategory, opportunityScore: scored.score, predictedRecoveryProbability: decision.estimatedRecoveryProbability, expectedRecoverableValue: scored.expectedRecoverableValuePaise, diagnosis: decision.diagnosis, currentStrategy: actionType, attempts: memory.recoveryAttempts, recoveryStartedAt: new Date(), nextActionAt: scheduledFor, decisions: { create: { id: crypto.randomUUID(), recommendedAction: decision.recommendedAction, confidence: decision.confidence, estimatedRecoveryProbability: decision.estimatedRecoveryProbability, merchantExplanation: decision.merchantExplanation, supportingEvidence: decision.supportingEvidence, riskFlags: decision.riskFlags, guardianDecision: guardian.decision, guardianReasons: guardian.reasons } }, actions: { create: { id: crypto.randomUUID(), type: actionType, status: status === 'STOPPED' ? 'CANCELLED' : ['SCHEDULED', 'PENDING_OBSERVATION'].includes(status) ? 'SCHEDULED' : 'PENDING', scheduledFor, metadata: { simulated: true, injectFailure: Boolean(input.injectProviderFailure) } } } } });
        await this.createAudit(tx, caseId, 'PAYMENT', 'PAYMENT_FAILED', input.provider === 'RAZORPAY' ? 'RAZORPAY' : 'SIMULATOR', failureDescriptionFor(decision.failureCategory), { providerEventId: input.providerEventId, amountPaise });
        await this.createAudit(tx, caseId, 'RECOVERY', 'RECOVERY_CASE_CREATED', 'SYSTEM', `${caseId} entered the persistent recovery pipeline.`, { paymentId });
        await this.createAudit(tx, caseId, 'DECISION', 'DETERMINISTIC_AUTOPSY_COMPLETED', 'PULSEBACK_AI', decision.merchantExplanation, { recommendedAction: decision.recommendedAction, confidence: decision.confidence });
        await this.createAudit(tx, caseId, 'GUARDIAN', `GUARDIAN_${guardian.decision}`, 'GUARDIAN', guardian.reasons.join(' · '), { policies } as unknown as Prisma.InputJsonValue);
        await tx.webhookEvent.update({ where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } }, data: { processedAt: new Date() } });
        return { ok: true, duplicate: false, eventId: input.providerEventId, caseId, message: 'Event committed through payment, case, decision, Guardian, action and audit.' };
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        const existing = input.caseId ? await this.getCase(input.caseId) : undefined;
        return { ok: true, duplicate: true, eventId: input.providerEventId, caseId: existing?.id ?? input.caseId, message: 'Duplicate event ignored. No duplicate payment, case or action was created.' };
      }
      throw error;
    }
  }

  async runCaseCommand(caseId: string, command: CaseCommand, reason?: string): Promise<CaseCommandResult> {
    const prisma = await getPrisma();
    const result = await prisma.$transaction(async tx => {
      const recovery = await tx.recoveryCase.findUnique({ where: { id: caseId }, include: caseInclude });
      if (!recovery) throw new Error('Recovery case not found');
      const pending = recovery.actions.find(a => ['PENDING', 'SCHEDULED', 'APPROVED'].includes(a.status));
      if (command === 'stop' || command === 'reject') {
        if (['RECOVERED', 'SELF_RECOVERED', 'STOPPED'].includes(recovery.status)) throw new Error(`Cannot ${command} a ${recovery.status.toLowerCase()} case`);
        await tx.recoveryAction.updateMany({ where: { recoveryCaseId: caseId, status: { in: ['PENDING', 'SCHEDULED', 'APPROVED'] } }, data: { status: command === 'reject' ? 'REJECTED' : 'CANCELLED', errorMessage: reason ?? 'Merchant stopped recovery.' } });
        await tx.recoveryCase.update({ where: { id: caseId }, data: { status: 'STOPPED', nextActionAt: null } });
        await this.createAudit(tx, caseId, 'MERCHANT_ACTION', command === 'reject' ? 'ACTION_REJECTED' : 'RECOVERY_STOPPED', 'MERCHANT', reason ?? `Recovery ${command} persisted.`, {});
        return { message: command === 'reject' ? 'Recommendation rejected and recovery stopped.' : 'Recovery stopped. No further actions will run.' };
      }
      if (command === 'escalate') {
        if (['RECOVERED', 'SELF_RECOVERED'].includes(recovery.status)) throw new Error('Recovered cases cannot be escalated');
        await tx.recoveryCase.update({ where: { id: caseId }, data: { status: 'ESCALATED', nextActionAt: null } });
        await this.createAudit(tx, caseId, 'MERCHANT_ACTION', 'RECOVERY_ESCALATED', 'MERCHANT', reason ?? 'Case escalated for manual review.', {});
        return { message: 'Recovery escalated for manual review.' };
      }
      if (command === 'approve') {
        if (recovery.status !== 'AWAITING_APPROVAL' || !pending) throw new Error('This case is not awaiting approval');
        const scheduledFor = new Date();
        await tx.recoveryAction.update({ where: { id: pending.id }, data: { status: 'SCHEDULED', scheduledFor } });
        await tx.recoveryCase.update({ where: { id: caseId }, data: { status: 'SCHEDULED', nextActionAt: scheduledFor } });
        await this.createAudit(tx, caseId, 'MERCHANT_ACTION', 'ACTION_APPROVED', 'MERCHANT', 'Merchant approved the pending recovery action.', { actionId: pending.id });
        return { message: 'Action approved and scheduled.' };
      }
      if (command === 'run') {
        if (recovery.activePaymentLinkId) return { message: 'Existing simulated Payment Link reused.', paymentLinkUrl: `https://rzp.io/i/demo-${caseId}`, reused: true };
        if (!pending) throw new Error('No pending recovery action is available');
        const policies = await this.getPoliciesInTransaction(tx);
        const domain = toDomain(recovery);
        const guardian = guardianFor(domain.amountPaise, domain.memory, domain.decision, policies);
        if (guardian.decision === 'BLOCKED') {
          await tx.recoveryAction.update({ where: { id: pending.id }, data: { status: 'SKIPPED', errorCode: 'GUARDIAN_BLOCKED', errorMessage: guardian.reasons.join(' · ') } });
          await tx.recoveryCase.update({ where: { id: caseId }, data: { status: 'STOPPED', nextActionAt: null } });
          await this.createAudit(tx, caseId, 'GUARDIAN', 'ACTION_BLOCKED', 'GUARDIAN', guardian.reasons.join(' · '), { actionId: pending.id });
          return { message: 'Guardian blocked the action.' };
        }
        const metadata = pending.metadata && typeof pending.metadata === 'object' && !Array.isArray(pending.metadata) ? pending.metadata as Record<string, unknown> : {};
        if (metadata.injectFailure) {
          await tx.recoveryAction.update({ where: { id: pending.id }, data: { status: 'FAILED', executedAt: new Date(), errorCode: 'SIMULATED_PROVIDER_UNAVAILABLE', errorMessage: 'Mock provider failure' } });
          await tx.recoveryCase.update({ where: { id: caseId }, data: { status: 'ESCALATED', nextActionAt: null } });
          await this.createAudit(tx, caseId, 'ACTION', 'ACTION_FAILED', 'SYSTEM', 'Mock provider failed; no duplicate action was created and the case escalated.', { actionId: pending.id });
          return { message: 'Mock provider failed safely; the case was escalated.' };
        }
        if (pending.type === 'CREATE_PAYMENT_LINK') {
          const providerReference = `plink_demo_${caseId}`;
          await tx.recoveryAction.update({ where: { id: pending.id }, data: { status: 'SUCCEEDED', providerReference, executedAt: new Date() } });
          await tx.recoveryCase.update({ where: { id: caseId }, data: { status: 'RECOVERING', activePaymentLinkId: providerReference, attempts: { increment: 1 }, nextActionAt: null } });
          await this.createAudit(tx, caseId, 'ACTION', 'PAYMENT_LINK_CREATED', 'SYSTEM', 'One persistent DEMO/SIMULATED Payment Link was created.', { actionId: pending.id, providerReference });
          return { message: 'Simulated Payment Link created and persisted.', paymentLinkUrl: `https://rzp.io/i/demo-${caseId}` };
        }
        await tx.recoveryAction.update({ where: { id: pending.id }, data: { status: 'SUCCEEDED', executedAt: new Date() } });
        await tx.recoveryCase.update({ where: { id: caseId }, data: { status: 'RECOVERING', attempts: { increment: 1 }, nextActionAt: null } });
        await this.createAudit(tx, caseId, 'ACTION', 'ACTION_EXECUTED', 'SYSTEM', `${pending.type} executed by the mock provider.`, { actionId: pending.id });
        return { message: 'Next recovery action executed and persisted.' };
      }
      throw new Error('Unsupported case command');
    });
    const updated = await this.getCase(caseId);
    if (!updated) throw new Error('Recovery case disappeared after mutation');
    return { ok: true, case: updated, ...result };
  }

  async processDueActions(now = new Date()): Promise<DueActionResult> {
    const prisma = await getPrisma();
    const due = await prisma.recoveryAction.findMany({ where: { status: 'SCHEDULED', scheduledFor: { lte: now } }, select: { id: true, recoveryCaseId: true } });
    const result = { processed: due.length, succeeded: 0, failed: 0, skipped: 0 };
    for (const action of due) {
      try {
        const outcome = await this.runCaseCommand(action.recoveryCaseId, 'run');
        if (outcome.case.status === 'ESCALATED') result.failed++; else if (outcome.case.status === 'STOPPED') result.skipped++; else result.succeeded++;
      } catch { result.failed++; }
    }
    return result;
  }

  async getDashboard(): Promise<DashboardSnapshot> {
    const cases = await this.listCases();
    const recovered = cases.filter(c => ['RECOVERED', 'SELF_RECOVERED'].includes(c.status));
    const atRisk = cases.filter(c => !['RECOVERED', 'SELF_RECOVERED'].includes(c.status)).reduce((sum, c) => sum + c.amountPaise, 0);
    const recoveredPaise = recovered.reduce((sum, c) => sum + c.recoveredAmountPaise, 0);
    const needs = cases.filter(c => c.status === 'AWAITING_APPROVAL');
    const pulseMap = new Map<string, { date: string; atRisk: number; recovered: number }>();
    for (const c of cases) { const date = c.createdAt.slice(5, 10); const row = pulseMap.get(date) ?? { date, atRisk: 0, recovered: 0 }; row.atRisk += c.amountPaise / 100; row.recovered += c.recoveredAmountPaise / 100; pulseMap.set(date, row); }
    const strategyMap = new Map<string, number>();
    for (const c of recovered) strategyMap.set(c.currentStrategy, (strategyMap.get(c.currentStrategy) ?? 0) + c.recoveredAmountPaise / 100);
    return { revenueAtRiskPaise: atRisk, revenueRecoveredPaise: recoveredPaise, recoveryRate: atRisk + recoveredPaise ? recoveredPaise / (atRisk + recoveredPaise) : 0, activeRecoveries: cases.filter(c => activeStatuses.has(c.status)).length, selfRecoveredPaise: cases.filter(c => c.status === 'SELF_RECOVERED').reduce((sum, c) => sum + c.recoveredAmountPaise, 0), selfRecoveredCount: cases.filter(c => c.status === 'SELF_RECOVERED').length, needsApproval: needs.length, needsApprovalPaise: needs.reduce((sum, c) => sum + c.amountPaise, 0), expectedRecoveryPaise: cases.filter(c => activeStatuses.has(c.status)).reduce((sum, c) => sum + c.expectedRecoverableValuePaise, 0), recoveredCount: recovered.length, opportunityQueue: cases.filter(c => activeStatuses.has(c.status)).slice(0, 4), recentActivity: (await this.listAuditEvents()).slice(0, 5), pulse: [...pulseMap.values()].sort((a, b) => a.date.localeCompare(b.date)), effectiveness: [...strategyMap].map(([strategy, recoveredAmount]) => ({ strategy: strategy.replaceAll('_', ' '), recovered: recoveredAmount })) };
  }

  async saveEvaluation(result: EvaluationResult) {
    const prisma = await getPrisma();
    const row = await prisma.evaluationRun.create({ data: { id: crypto.randomUUID(), seed: result.seed, caseCount: result.caseCount, revenueAtRisk: result.revenueAtRiskPaise, baselineRecovered: result.baseline.recoveredPaise, pulseBackRecovered: result.pulseBack.recoveredPaise, metrics: result as unknown as Prisma.InputJsonValue } });
    return { id: row.id, seed: row.seed, caseCount: row.caseCount, revenueAtRiskPaise: row.revenueAtRisk, baselineRecoveredPaise: row.baselineRecovered, pulseBackRecoveredPaise: row.pulseBackRecovered, createdAt: row.createdAt.toISOString() };
  }
  async listEvaluationRuns(limit = 5): Promise<EvaluationRunSummary[]> {
    const prisma = await getPrisma();
    const rows = await prisma.evaluationRun.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map(row => ({ id: row.id, seed: row.seed, caseCount: row.caseCount, revenueAtRiskPaise: row.revenueAtRisk, baselineRecoveredPaise: row.baselineRecovered, pulseBackRecoveredPaise: row.pulseBackRecovered, createdAt: row.createdAt.toISOString() }));
  }

  private async getPoliciesInTransaction(tx: Prisma.TransactionClient): Promise<GuardianPolicies> {
    const policy = await tx.policy.findUnique({ where: { merchantId } });
    return policy ? { operatingMode: policy.operatingMode, autonomousAmountThresholdPaise: policy.autonomousAmountThresholdPaise, observationWindowMinutes: policy.observationWindowMinutes, maxAttemptsPerCase: policy.maxAttemptsPerCase, contactsPer24h: policy.contactsPer24h, contactsPer7d: policy.contactsPer7d, minimumConfidence: policy.minimumConfidence, highRiskAutoStop: policy.highRiskAutoStop, newCustomerApprovalThresholdPaise: policy.newCustomerApprovalThresholdPaise, preventRepeatedAction: policy.preventRepeatedAction, fatigueStopThreshold: policy.fatigueStopThreshold } : { ...DEFAULT_POLICIES };
  }
  private async createAudit(tx: Prisma.TransactionClient, recoveryCaseId: string | null, category: string, eventType: string, actorName: string, message: string, metadata: Prisma.InputJsonValue) {
    await tx.auditEvent.create({ data: { id: crypto.randomUUID(), merchantId, recoveryCaseId, category, eventType, actor: actorName, message, metadata } });
  }
}
