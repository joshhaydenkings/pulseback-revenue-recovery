import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma-node/client';
import { DEFAULT_POLICIES } from '../domain/recovery/types';
import { auditEvents, demoCases } from '../lib/demo-data';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? 'postgresql://pulseback:pulseback@localhost:54329/pulseback?schema=public';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const merchantId = 'merchant_demo';

async function seed() {
  await prisma.$transaction(async (tx) => {
    await tx.merchant.deleteMany({ where: { id: merchantId } });
    await tx.evaluationRun.deleteMany({});
    await tx.webhookEvent.deleteMany({ where: { provider: { in: ['DEMO_SEED', 'SIMULATOR'] } } });

    await tx.merchant.create({
      data: {
        id: merchantId,
        name: 'PulseBack Demo Merchant',
        operatingMode: 'AUTOPILOT',
        currency: 'INR',
        autonomousAmountThreshold: DEFAULT_POLICIES.autonomousAmountThresholdPaise,
        observationWindowMinutes: DEFAULT_POLICIES.observationWindowMinutes,
        policy: {
          create: {
            id: 'policy_demo',
            operatingMode: DEFAULT_POLICIES.operatingMode,
            autonomousAmountThresholdPaise: DEFAULT_POLICIES.autonomousAmountThresholdPaise,
            observationWindowMinutes: DEFAULT_POLICIES.observationWindowMinutes,
            maxAttemptsPerCase: DEFAULT_POLICIES.maxAttemptsPerCase,
            contactsPer24h: DEFAULT_POLICIES.contactsPer24h,
            contactsPer7d: DEFAULT_POLICIES.contactsPer7d,
            minimumConfidence: DEFAULT_POLICIES.minimumConfidence,
            highRiskAutoStop: DEFAULT_POLICIES.highRiskAutoStop,
            newCustomerApprovalThresholdPaise: DEFAULT_POLICIES.newCustomerApprovalThresholdPaise,
            preventRepeatedAction: DEFAULT_POLICIES.preventRepeatedAction,
            fatigueStopThreshold: DEFAULT_POLICIES.fatigueStopThreshold,
          },
        },
      },
    });

    for (const recovery of demoCases) {
      await tx.customer.create({
        data: {
          id: recovery.customerId,
          merchantId,
          externalCustomerId: `demo_${recovery.customerId}`,
          name: recovery.customerName,
          email: recovery.customerEmail,
          phone: `+9198000${recovery.customerId.slice(-1).padStart(5, '0')}`,
          totalSuccessfulPayments: recovery.memory.successfulPayments,
          totalFailedPayments: recovery.memory.failedPayments,
          lastContactAt: recovery.memory.lastContactAt ? new Date(recovery.memory.lastContactAt) : null,
          recoveryFatigueScore: recovery.memory.fatigueScore,
        },
      });
      await tx.payment.create({
        data: {
          id: `payment_${recovery.id}`,
          merchantId,
          customerId: recovery.customerId,
          provider: 'DEMO_SEED',
          providerPaymentId: recovery.paymentId,
          providerOrderId: `order_demo_${recovery.id}`,
          amount: recovery.amountPaise,
          currency: recovery.currency,
          paymentMethod: recovery.paymentMethod,
          status: recovery.status === 'RECOVERED' || recovery.status === 'SELF_RECOVERED' ? 'captured' : 'failed',
          failureCode: recovery.failureCategory,
          failureDescription: recovery.failureDescription,
          createdAt: new Date(recovery.createdAt),
        },
      });
      await tx.recoveryCase.create({
        data: {
          id: recovery.id,
          merchantId,
          customerId: recovery.customerId,
          paymentId: `payment_${recovery.id}`,
          status: recovery.status,
          failureCategory: recovery.failureCategory,
          opportunityScore: recovery.opportunityScore,
          predictedRecoveryProbability: recovery.predictedRecoveryProbability,
          expectedRecoverableValue: recovery.expectedRecoverableValuePaise,
          diagnosis: recovery.decision.diagnosis,
          currentStrategy: recovery.currentStrategy,
          attempts: recovery.attempts,
          recoveredAmount: recovery.recoveredAmountPaise,
          recoveryStartedAt: new Date(recovery.createdAt),
          recoveredAt: recovery.recoveredAmountPaise ? new Date(recovery.timeline.at(-1)?.time ?? recovery.createdAt) : null,
          nextActionAt: recovery.nextActionAt ? new Date(recovery.nextActionAt) : null,
          activePaymentLinkId: recovery.activePaymentLinkId,
          createdAt: new Date(recovery.createdAt),
          decisions: {
            create: {
              id: `decision_${recovery.id}`,
              recommendedAction: recovery.decision.recommendedAction,
              confidence: recovery.decision.confidence,
              estimatedRecoveryProbability: recovery.decision.estimatedRecoveryProbability,
              merchantExplanation: recovery.decision.merchantExplanation,
              supportingEvidence: recovery.decision.supportingEvidence as Prisma.InputJsonValue,
              riskFlags: recovery.decision.riskFlags as Prisma.InputJsonValue,
              guardianDecision: recovery.guardianDecision,
              guardianReasons: recovery.guardianReasons as Prisma.InputJsonValue,
            },
          },
          actions: recovery.currentStrategy !== 'OBSERVE' || recovery.nextActionAt ? {
            create: {
              id: `action_${recovery.id}`,
              type: recovery.currentStrategy,
              status: recovery.status === 'RECOVERED' ? 'SUCCEEDED' : recovery.status === 'STOPPED' ? 'CANCELLED' : recovery.status === 'ESCALATED' ? 'FAILED' : recovery.status === 'AWAITING_APPROVAL' ? 'PENDING' : recovery.status === 'RECOVERING' ? 'SUCCEEDED' : 'SCHEDULED',
              providerReference: recovery.activePaymentLinkId,
              scheduledFor: recovery.nextActionAt ? new Date(recovery.nextActionAt) : null,
              executedAt: ['RECOVERED', 'RECOVERING', 'ESCALATED'].includes(recovery.status) ? new Date(recovery.timeline.at(-1)?.time ?? recovery.createdAt) : null,
              metadata: { synthetic: true, source: 'DEMO_SEED' },
            },
          } : undefined,
        },
      });
    }

    for (const event of auditEvents) {
      await tx.auditEvent.create({
        data: {
          id: event.id,
          merchantId,
          recoveryCaseId: event.caseId,
          category: 'RECOVERY',
          eventType: event.event.toUpperCase().replaceAll(' ', '_'),
          actor: event.actor,
          message: event.message,
          metadata: event.metadata as Prisma.InputJsonValue,
          createdAt: new Date(event.timestamp),
        },
      });
    }
  });
}

seed()
  .then(() => console.log(`Seeded ${demoCases.length} synthetic PulseBack recovery cases.`))
  .finally(() => prisma.$disconnect());
