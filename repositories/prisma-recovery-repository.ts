import { Prisma } from "../generated/prisma/client";
import type { EvaluationResult } from "../domain/evaluation/simulator";
import type {
  CustomerMemory,
  GuardianPolicies,
  RecoveryCase,
  TimelineEvent,
} from "../domain/recovery/types";
import { DEFAULT_POLICIES } from "../domain/recovery/types";
import { evaluateGuardian } from "../domain/guardian/evaluate";
import { getPrisma, retryDatabaseRead } from "../lib/db/prisma";
import { formatInrPaise } from "../lib/money";
import { absoluteSiteUrl } from "../lib/site-url";
import { resolveNotificationProvider } from "../lib/notifications/notification-provider";
import { resolveRecoveryDecision } from "../lib/ai/decision-engine";
import { buildRecoveryDecisionContext } from "../lib/ai/recovery-decision-context";
import {
  resolvePaymentProvider,
  RazorpayProviderError,
} from "../lib/razorpay/payment-provider";
import {
  actionTypeFor,
  buildDeterministicDecision,
  failureDescriptionFor,
  guardianFor,
  scoreRecovery,
} from "../services/deterministic-recovery";
import type {
  CaseCommand,
  CaseCommandResult,
  DashboardSnapshot,
  DueActionResult,
  EvaluationRunSummary,
  RecoveryEventInput,
  RecoveryEventResult,
  RecoveryRepository,
} from "./types";

const merchantId = "merchant_demo";
const activeStatuses = new Set([
  "DETECTED",
  "PENDING_OBSERVATION",
  "ANALYZING",
  "PLAN_READY",
  "AWAITING_APPROVAL",
  "SCHEDULED",
  "ACTION_IN_PROGRESS",
  "RECOVERING",
]);
const caseInclude = {
  customer: true,
  payment: true,
  merchant: true,
  decisions: { orderBy: { createdAt: "desc" as const }, take: 1 },
  actions: { orderBy: { createdAt: "desc" as const } },
  auditEvents: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.RecoveryCaseInclude;
type CaseRecord = Prisma.RecoveryCaseGetPayload<{
  include: typeof caseInclude;
}>;

function jsonStrings(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(-14);
}
function auditKind(eventType: string): TimelineEvent["kind"] {
  if (eventType.includes("FAILED")) return "danger";
  if (
    eventType.includes("APPROVED") ||
    eventType.includes("RECOVERED") ||
    eventType.includes("CREATED") ||
    eventType.includes("EXECUTED")
  )
    return "success";
  if (
    eventType.includes("GUARDIAN") ||
    eventType.includes("STOP") ||
    eventType.includes("ESCALAT")
  )
    return "warning";
  if (eventType.includes("DIAGNOSIS") || eventType.includes("AUTOPSY"))
    return "ai";
  return "neutral";
}
function actor(value: string): TimelineEvent["actor"] {
  return [
    "RAZORPAY",
    "PULSEBACK_AI",
    "GUARDIAN",
    "SYSTEM",
    "MERCHANT",
    "CUSTOMER",
    "SIMULATOR",
  ].includes(value)
    ? (value as TimelineEvent["actor"])
    : "SYSTEM";
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
  const fallback = buildDeterministicDecision("authentication_failure", memory);
  const decision = latest
    ? {
        diagnosis: record.diagnosis,
        failureCategory:
          record.failureCategory as RecoveryCase["failureCategory"],
        recommendedAction:
          latest.recommendedAction as RecoveryCase["decision"]["recommendedAction"],
        confidence: latest.confidence,
        estimatedRecoveryProbability: latest.estimatedRecoveryProbability,
        merchantExplanation: latest.merchantExplanation,
        supportingEvidence: jsonStrings(latest.supportingEvidence),
        riskFlags: jsonStrings(latest.riskFlags),
        suggestedWaitMinutes: latest.suggestedWaitMinutes,
        waitMinutes: latest.suggestedWaitMinutes ?? undefined,
        customerFriction:
          latest.customerFriction as RecoveryCase["decision"]["customerFriction"],
        urgency: latest.urgency as RecoveryCase["decision"]["urgency"],
        decisionProvider:
          latest.decisionProvider as RecoveryCase["decision"]["decisionProvider"],
        model: latest.model ?? undefined,
        fallbackReason:
          latest.fallbackReason as RecoveryCase["decision"]["fallbackReason"],
        createdAt: latest.createdAt.toISOString(),
      }
    : fallback;
  return {
    id: record.id,
    paymentId: record.payment.providerPaymentId,
    customerId: record.customerId,
    customerName: record.customer.name,
    customerEmail: record.customer.email,
    amountPaise: record.payment.amount,
    currency: "INR",
    paymentMethod: record.payment.paymentMethod,
    status: record.status,
    failureCategory: record.failureCategory as RecoveryCase["failureCategory"],
    failureDescription: record.payment.failureDescription ?? record.diagnosis,
    opportunityScore: record.opportunityScore,
    predictedRecoveryProbability: record.predictedRecoveryProbability,
    expectedRecoverableValuePaise: record.expectedRecoverableValue,
    currentStrategy: record.currentStrategy as RecoveryCase["currentStrategy"],
    attempts: record.attempts,
    recoveredAmountPaise: record.recoveredAmount,
    riskFlags: latest ? jsonStrings(latest.riskFlags) : [],
    createdAt: record.createdAt.toISOString(),
    nextActionAt: record.nextActionAt?.toISOString(),
    activePaymentLinkId: record.activePaymentLinkId ?? undefined,
    activePaymentLinkUrl:
      record.actions.find(
        (action) => action.providerReference === record.activePaymentLinkId,
      )?.providerUrl ?? undefined,
    provenance: record.payment.provenance as RecoveryCase["provenance"],
    operatingMode: record.merchant.operatingMode,
    memory,
    decision,
    guardianDecision: (latest?.guardianDecision ??
      "APPROVAL_REQUIRED") as RecoveryCase["guardianDecision"],
    guardianReasons: latest ? jsonStrings(latest.guardianReasons) : [],
    timeline: record.auditEvents.map((event) => ({
      id: event.id,
      time: event.createdAt.toISOString(),
      actor: actor(event.actor),
      title: event.eventType.replaceAll("_", " "),
      description: event.message,
      kind: auditKind(event.eventType),
      metadata:
        event.metadata &&
        typeof event.metadata === "object" &&
        !Array.isArray(event.metadata)
          ? (event.metadata as Record<string, unknown>)
          : undefined,
    })),
  };
}

export class PrismaRecoveryRepository implements RecoveryRepository {
  readonly kind = "postgresql" as const;

  async listCases() {
    const rows = await retryDatabaseRead(async () => {
      const prisma = await getPrisma();
      return prisma.recoveryCase.findMany({
        where: { merchantId },
        include: caseInclude,
        orderBy: [{ opportunityScore: "desc" }, { createdAt: "desc" }],
      });
    });
    return rows.map(toDomain);
  }
  async getCase(id: string) {
    const row = await retryDatabaseRead(async () => {
      const prisma = await getPrisma();
      return prisma.recoveryCase.findUnique({
        where: { id },
        include: caseInclude,
      });
    });
    return row ? toDomain(row) : undefined;
  }
  async listAuditEvents() {
    const rows = await retryDatabaseRead(async () => {
      const prisma = await getPrisma();
      return prisma.auditEvent.findMany({
        where: { merchantId },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
    });
    return rows.map((event) => ({
      id: event.id,
      timestamp: event.createdAt.toISOString(),
      actor: event.actor,
      caseId: event.recoveryCaseId ?? "—",
      event: event.eventType.replaceAll("_", " "),
      outcome: event.eventType.includes("FAILED")
        ? "Needs review"
        : event.eventType.includes("RECOVERED") ||
            event.eventType.includes("EXECUTED")
          ? "Completed"
          : "Recorded",
      message: event.message,
      metadata: event.metadata,
    }));
  }
  async getPolicies() {
    const prisma = await getPrisma();
    const policy = await prisma.policy.findUnique({ where: { merchantId } });
    return policy
      ? {
          operatingMode: policy.operatingMode,
          autonomousAmountThresholdPaise: policy.autonomousAmountThresholdPaise,
          observationWindowMinutes: policy.observationWindowMinutes,
          maxAttemptsPerCase: policy.maxAttemptsPerCase,
          contactsPer24h: policy.contactsPer24h,
          contactsPer7d: policy.contactsPer7d,
          minimumConfidence: policy.minimumConfidence,
          highRiskAutoStop: policy.highRiskAutoStop,
          newCustomerApprovalThresholdPaise:
            policy.newCustomerApprovalThresholdPaise,
          preventRepeatedAction: policy.preventRepeatedAction,
          fatigueStopThreshold: policy.fatigueStopThreshold,
        }
      : { ...DEFAULT_POLICIES };
  }
  async savePolicies(policies: GuardianPolicies, actorName = "MERCHANT") {
    const prisma = await getPrisma();
    await prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUniqueOrThrow({
        where: { id: merchantId },
      });
      await tx.policy.upsert({
        where: { merchantId },
        create: { id: `policy_${merchantId}`, merchantId, ...policies },
        update: policies,
      });
      await tx.merchant.update({
        where: { id: merchantId },
        data: {
          operatingMode: policies.operatingMode,
          autonomousAmountThreshold: policies.autonomousAmountThresholdPaise,
          observationWindowMinutes: policies.observationWindowMinutes,
        },
      });
      await tx.auditEvent.create({
        data: {
          id: crypto.randomUUID(),
          merchantId,
          category: "POLICY",
          eventType:
            merchant.operatingMode === policies.operatingMode
              ? "POLICY_UPDATED"
              : "OPERATING_MODE_CHANGED",
          actor: actorName,
          message:
            merchant.operatingMode === policies.operatingMode
              ? "Guardian policy configuration updated."
              : `Operating mode changed from ${merchant.operatingMode} to ${policies.operatingMode}.`,
          metadata: policies as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return policies;
  }

  async processEvent(input: RecoveryEventInput): Promise<RecoveryEventResult> {
    const prisma = await getPrisma();
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.webhookEvent.create({
          data: {
            id: crypto.randomUUID(),
            provider: input.provider,
            providerEventId: input.providerEventId,
            eventType: input.type,
            payload: (input.payload ?? input) as Prisma.InputJsonValue,
          },
        });
        const existing = input.caseId
          ? await tx.recoveryCase.findUnique({
              where: { id: input.caseId },
              include: caseInclude,
            })
          : await tx.recoveryCase.findFirst({
              where: {
                OR: [
                  ...(input.providerLinkId
                    ? [
                        {
                          actions: {
                            some: { providerReference: input.providerLinkId },
                          },
                        },
                      ]
                    : []),
                  ...(input.providerPaymentId
                    ? [
                        {
                          payment: {
                            provider: input.provider,
                            providerPaymentId: input.providerPaymentId,
                          },
                        },
                      ]
                    : []),
                  ...(input.providerOrderId
                    ? [
                        {
                          payment: {
                            provider: input.provider,
                            providerOrderId: input.providerOrderId,
                          },
                        },
                      ]
                    : []),
                ],
              },
              include: caseInclude,
            });
        const markProcessed = () =>
          tx.webhookEvent.update({
            where: {
              provider_providerEventId: {
                provider: input.provider,
                providerEventId: input.providerEventId,
              },
            },
            data: { processedAt: new Date() },
          });

        if (
          input.type === "late_authorization" ||
          input.type === "payment_captured"
        ) {
          if (!existing) {
            if (input.providerPaymentId)
              await tx.payment.updateMany({
                where: {
                  provider: input.provider,
                  providerPaymentId: input.providerPaymentId,
                },
                data: {
                  status:
                    input.type === "payment_captured"
                      ? "captured"
                      : "authorized",
                },
              });
            if (input.providerOrderId)
              await tx.providerOrder.updateMany({
                where: {
                  provider: input.provider,
                  providerOrderId: input.providerOrderId,
                },
                data: {
                  status:
                    input.type === "payment_captured"
                      ? "captured"
                      : "authorized",
                },
              });
            await markProcessed();
            return {
              ok: true,
              duplicate: false,
              eventId: input.providerEventId,
              message:
                "Payment update persisted; no active recovery case matched.",
            };
          }
          if (activeStatuses.has(existing.status)) {
            await tx.recoveryAction.updateMany({
              where: {
                recoveryCaseId: existing.id,
                status: { in: ["PENDING", "SCHEDULED", "APPROVED"] },
              },
              data: {
                status: "CANCELLED",
                errorCode: "LATE_AUTHORIZATION",
                errorMessage: "Cancelled before customer contact.",
              },
            });
            await tx.recoveryCase.update({
              where: { id: existing.id },
              data: {
                status: "SELF_RECOVERED",
                recoveredAmount: existing.payment.amount,
                recoveredAt: new Date(),
                nextActionAt: null,
              },
            });
            await tx.payment.update({
              where: { id: existing.paymentId },
              data: {
                status:
                  input.type === "payment_captured" ? "captured" : "authorized",
              },
            });
            await this.createAudit(
              tx,
              existing.id,
              "RECOVERY",
              input.type === "payment_captured"
                ? "ORIGINAL_PAYMENT_CAPTURED"
                : "LATE_AUTHORIZATION",
              input.provider === "RAZORPAY" ? "RAZORPAY" : "SIMULATOR",
              "Original payment succeeded before recovery execution. Pending recovery was cancelled before customer contact.",
              {
                recoveredAmountPaise: existing.payment.amount,
                providerOrderId: input.providerOrderId,
              },
            );
          }
          await markProcessed();
          return {
            ok: true,
            duplicate: false,
            eventId: input.providerEventId,
            caseId: existing.id,
            message:
              "Late Authorization Guard persisted self-recovery and cancelled pending actions.",
          };
        }
        if (input.type === "payment_link_paid") {
          if (!existing) {
            await markProcessed();
            return {
              ok: true,
              duplicate: false,
              eventId: input.providerEventId,
              message:
                "Payment Link event persisted, but no recovery case matched the provider association.",
            };
          }
          const linkAction = existing.actions.find(
            (action) =>
              action.type === "CREATE_PAYMENT_LINK" &&
              (!input.providerLinkId ||
                action.providerReference === input.providerLinkId),
          );
          const validAssociation =
            input.provider !== "RAZORPAY" ||
            Boolean(
              linkAction &&
                input.providerLinkId &&
                input.providerLinkReference ===
                  `pulseback_recovery_${existing.id}`,
            );
          const recoveredAmount = input.amountPaise ?? existing.payment.amount;
          if (
            !validAssociation ||
            recoveredAmount !== existing.payment.amount
          ) {
            await this.createAudit(
              tx,
              existing.id,
              "SECURITY",
              "PAYMENT_LINK_EVENT_REJECTED",
              "RAZORPAY",
              "Payment Link event did not match the expected case, provider link, reference and amount.",
              {
                providerLinkId: input.providerLinkId,
                referenceId: input.providerLinkReference,
                receivedAmountPaise: recoveredAmount,
                expectedAmountPaise: existing.payment.amount,
              },
            );
            await markProcessed();
            return {
              ok: true,
              duplicate: false,
              eventId: input.providerEventId,
              caseId: existing.id,
              message:
                "Payment Link event rejected because its association or amount did not match.",
            };
          }
          if (existing.status !== "RECOVERED") {
            if (input.providerPaymentId)
              await tx.payment.upsert({
                where: {
                  provider_providerPaymentId: {
                    provider: input.provider,
                    providerPaymentId: input.providerPaymentId,
                  },
                },
                create: {
                  id: crypto.randomUUID(),
                  merchantId,
                  customerId: existing.customerId,
                  provider: input.provider,
                  providerPaymentId: input.providerPaymentId,
                  providerOrderId: input.providerOrderId,
                  amount: recoveredAmount,
                  currency: "INR",
                  paymentMethod:
                    input.paymentMethod ?? "Razorpay Test Payment Link",
                  status: "captured",
                  provenance:
                    input.provider === "RAZORPAY"
                      ? "RAZORPAY_TEST"
                      : "SYNTHETIC_DEMO",
                  providerMetadata: {
                    purpose: "recovery",
                    providerLinkId: input.providerLinkId,
                  },
                },
                update: {
                  status: "captured",
                  amount: recoveredAmount,
                  providerOrderId: input.providerOrderId,
                },
              });
            await tx.recoveryCase.update({
              where: { id: existing.id },
              data: {
                status: "RECOVERED",
                recoveredAmount,
                recoveredAt: new Date(),
                nextActionAt: null,
              },
            });
            if (linkAction)
              await tx.recoveryAction.update({
                where: { id: linkAction.id },
                data: {
                  status: "SUCCEEDED",
                  providerStatus: "paid",
                  executedAt: new Date(),
                },
              });
            await tx.recoveryAction.updateMany({
              where: {
                recoveryCaseId: existing.id,
                status: { in: ["PENDING", "SCHEDULED", "APPROVED"] },
              },
              data: {
                status: "CANCELLED",
                errorMessage: "Recovery completed.",
              },
            });
            await this.createAudit(
              tx,
              existing.id,
              "RECOVERY",
              "PAYMENT_RECOVERED",
              "CUSTOMER",
              `${formatInrPaise(recoveredAmount)} ${input.provider === "RAZORPAY" ? "Razorpay Test Mode" : "simulated"} payment recovered.`,
              {
                recoveredAmountPaise: recoveredAmount,
                providerLinkId: input.providerLinkId,
                providerPaymentId: input.providerPaymentId,
              },
            );
          }
          await markProcessed();
          return {
            ok: true,
            duplicate: false,
            eventId: input.providerEventId,
            caseId: existing.id,
            message: "Recovery case marked RECOVERED.",
          };
        }
        if (
          (input.type === "payment_link_expired" ||
            input.type === "payment_link_cancelled") &&
          existing
        ) {
          const policies = await this.getPoliciesInTransaction(tx);
          const stopped = existing.attempts >= policies.maxAttemptsPerCase;
          await tx.recoveryAction.updateMany({
            where: {
              recoveryCaseId: existing.id,
              providerReference: input.providerLinkId,
            },
            data: {
              status: "CANCELLED",
              providerStatus:
                input.type === "payment_link_expired" ? "expired" : "cancelled",
              errorCode: input.type.toUpperCase(),
              errorMessage: "Razorpay Test Payment Link is no longer active.",
            },
          });
          await tx.recoveryCase.update({
            where: { id: existing.id },
            data: {
              status: stopped ? "STOPPED" : "ESCALATED",
              activePaymentLinkId: null,
              nextActionAt: null,
            },
          });
          await this.createAudit(
            tx,
            existing.id,
            "ACTION",
            input.type === "payment_link_expired"
              ? "PAYMENT_LINK_EXPIRED"
              : "PAYMENT_LINK_CANCELLED",
            "RAZORPAY",
            `Razorpay Test Payment Link ${input.type === "payment_link_expired" ? "expired" : "was cancelled"}; no recovery was counted.`,
            { providerLinkId: input.providerLinkId },
          );
          await markProcessed();
          return {
            ok: true,
            duplicate: false,
            eventId: input.providerEventId,
            caseId: existing.id,
            message: `Payment Link ${input.type === "payment_link_expired" ? "expiration" : "cancellation"} persisted without recovery.`,
          };
        }
        if (input.type === "payment_link_error" && existing) {
          await tx.recoveryAction.updateMany({
            where: {
              recoveryCaseId: existing.id,
              status: { in: ["PENDING", "SCHEDULED", "APPROVED"] },
            },
            data: {
              status: "FAILED",
              executedAt: new Date(),
              errorCode: "SIMULATED_PROVIDER_UNAVAILABLE",
              errorMessage: "Mock provider failure",
            },
          });
          await tx.recoveryCase.update({
            where: { id: existing.id },
            data: { status: "ESCALATED", nextActionAt: null },
          });
          await this.createAudit(
            tx,
            existing.id,
            "ACTION",
            "ACTION_FAILED",
            "SYSTEM",
            "Mock provider action failed. No duplicate action was created; case escalated.",
            { simulated: true },
          );
          await markProcessed();
          return {
            ok: true,
            duplicate: false,
            eventId: input.providerEventId,
            caseId: existing.id,
            message: "Provider failure handled safely and case escalated.",
          };
        }

        if (existing) {
          await tx.payment.update({
            where: { id: existing.paymentId },
            data: {
              status: "failed",
              failureCode: input.failureCode ?? existing.payment.failureCode,
              failureDescription:
                input.failureDescription ?? existing.payment.failureDescription,
              providerMetadata: (input.providerMetadata ??
                {}) as Prisma.InputJsonValue,
            },
          });
          await this.createAudit(
            tx,
            existing.id,
            "WEBHOOK",
            "REPEATED_PAYMENT_FAILURE_RECORDED",
            input.provider === "RAZORPAY" ? "RAZORPAY" : "SIMULATOR",
            "A repeated failure event was attached to the existing recovery case without creating another case or action.",
            { providerEventId: input.providerEventId },
          );
          await markProcessed();
          return {
            ok: true,
            duplicate: false,
            eventId: input.providerEventId,
            caseId: existing.id,
            message:
              "Existing payment and recovery case updated without duplication.",
          };
        }

        const policies = await this.getPoliciesInTransaction(tx);
        const amountPaise =
          input.amountPaise ??
          (input.type === "high_value_failure" ? 4_200_000 : 499_900);
        const suffix = cleanId(input.providerEventId) || String(Date.now());
        const caseId = `RC-${suffix}`;
        const providerOrder = input.providerOrderId
          ? await tx.providerOrder.findUnique({
              where: {
                provider_providerOrderId: {
                  provider: input.provider,
                  providerOrderId: input.providerOrderId,
                },
              },
            })
          : null;
        const customerId = providerOrder?.customerId ?? `cust_sim_${suffix}`;
        const paymentId = `payment_${input.provider.toLowerCase()}_${suffix}`;
        const customerHistory = providerOrder?.customerId
          ? await tx.customer.findUnique({ where: { id: providerOrder.customerId } })
          : null;
        const storedHistory = customerHistory
          ? await Promise.all([
              tx.recoveryAction.count({
                where: {
                  recoveryCase: { customerId: customerHistory.id },
                  executedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
                },
              }),
              tx.recoveryAction.count({
                where: {
                  recoveryCase: { customerId: customerHistory.id },
                  executedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
                },
              }),
              tx.recoveryCase.count({
                where: { customerId: customerHistory.id, status: "RECOVERED" },
              }),
            ])
          : [0, 1, 1];
        const memory: CustomerMemory = {
          successfulPayments: customerHistory?.totalSuccessfulPayments ?? 4,
          failedPayments: customerHistory?.totalFailedPayments ?? 1,
          recoveryAttempts: input.type === "repeated_failure" ? 2 : 0,
          contacts24h:
            input.type === "exhausted_contact_limit"
              ? policies.contactsPer24h
              : storedHistory[0],
          contacts7d:
            input.type === "exhausted_contact_limit"
              ? policies.contactsPer7d
              : storedHistory[1],
          previousRecoveries: storedHistory[2],
          fatigueScore:
            input.type === "exhausted_contact_limit"
              ? 95
              : customerHistory?.recoveryFatigueScore ?? 18,
          preferredMethod: input.paymentMethod ?? "Card •••• 4408",
          lastContactAt: customerHistory?.lastContactAt?.toISOString(),
        };
        const baselineDecision = buildDeterministicDecision(input.type, memory);
        const useAI =
          input.provider === "RAZORPAY" || input.useLiveAI === true;
        const context = buildRecoveryDecisionContext({
          transaction: {
            amountPaise,
            currency: "INR",
            paymentMethod: input.paymentMethod ?? "Card",
            failureCategory: baselineDecision.failureCategory,
            failureReason:
              input.failureDescription ??
              failureDescriptionFor(baselineDecision.failureCategory),
            errorSource:
              String(input.providerMetadata?.errorSource ?? "") || undefined,
            errorStep:
              String(input.providerMetadata?.errorStep ?? "") || undefined,
            failedAt: input.occurredAt,
          },
          customer: {
            internalCustomerId: customerId,
            successfulPayments: memory.successfulPayments,
            failedPayments: memory.failedPayments,
            previousRecoveries: memory.previousRecoveries,
            contacts24h: memory.contacts24h,
            contacts7d: memory.contacts7d,
            fatigueScore: memory.fatigueScore,
            lastContactAt: memory.lastContactAt,
            preferredMethod: memory.preferredMethod,
          },
          recovery: {
            status: "ANALYZING",
            attempts: memory.recoveryAttempts,
            previousActions: [],
          },
          policies,
          riskFlags: [],
        });
        const analysis = await resolveRecoveryDecision(context, { useAI });
        const decision = {
          ...analysis.decision,
          riskFlags: [
            ...new Set([
              ...analysis.decision.riskFlags,
              ...context.risk.knownRiskFlags,
            ]),
          ],
        };
        const scored = scoreRecovery(amountPaise, decision, memory);
        const guardian = guardianFor(amountPaise, memory, decision, policies);
        const actionType = actionTypeFor(decision);
        const status =
          decision.recommendedAction === "STOP" ||
          guardian.decision === "BLOCKED"
            ? "STOPPED"
            : policies.operatingMode === "SHADOW"
              ? "PLAN_READY"
              : guardian.decision === "APPROVAL_REQUIRED" ||
                  policies.operatingMode === "APPROVAL"
                ? "AWAITING_APPROVAL"
                : decision.recommendedAction === "OBSERVE"
                  ? "PENDING_OBSERVATION"
                  : "SCHEDULED";
        const scheduledFor = ["SCHEDULED", "PENDING_OBSERVATION"].includes(
          status,
        )
          ? new Date(Date.now() + (decision.waitMinutes ?? 0) * 60_000)
          : null;
        if (providerOrder?.customerId)
          await tx.customer.update({
            where: { id: providerOrder.customerId },
            data: { totalFailedPayments: { increment: 1 } },
          });
        else
          await tx.customer.create({
            data: {
              id: customerId,
              merchantId,
              externalCustomerId: `${input.provider.toLowerCase()}_${suffix}`,
              name:
                input.customerName ??
                (input.type === "high_value_failure"
                  ? "Aarav Mehta"
                  : "Demo Customer"),
              email: input.customerEmail ?? "demo.customer@example.com",
              totalSuccessfulPayments: memory.successfulPayments,
              totalFailedPayments: memory.failedPayments,
              recoveryFatigueScore: memory.fatigueScore,
            },
          });
        await tx.payment.create({
          data: {
            id: paymentId,
            merchantId,
            customerId,
            provider: input.provider,
            providerPaymentId: input.providerPaymentId ?? `pay_sim_${suffix}`,
            providerOrderId: input.providerOrderId,
            amount: amountPaise,
            currency: "INR",
            paymentMethod: input.paymentMethod ?? "Card •••• 4408",
            status: "failed",
            failureCode: input.failureCode ?? decision.failureCategory,
            failureDescription:
              input.failureDescription ??
              failureDescriptionFor(decision.failureCategory),
            failureSource:
              String(input.providerMetadata?.errorSource ?? "") || null,
            failureStep:
              String(input.providerMetadata?.errorStep ?? "") || null,
            failureReason:
              String(input.providerMetadata?.errorReason ?? "") || null,
            providerMetadata: (input.providerMetadata ??
              {}) as Prisma.InputJsonValue,
            provenance:
              input.provider === "RAZORPAY"
                ? "RAZORPAY_TEST"
                : "SYNTHETIC_DEMO",
          },
        });
        await tx.recoveryCase.create({
          data: {
            id: caseId,
            merchantId,
            customerId,
            paymentId,
            status,
            failureCategory: decision.failureCategory,
            opportunityScore: scored.score,
            predictedRecoveryProbability: decision.estimatedRecoveryProbability,
            expectedRecoverableValue: scored.expectedRecoverableValuePaise,
            diagnosis: decision.diagnosis,
            currentStrategy: actionType,
            attempts: memory.recoveryAttempts,
            recoveryStartedAt: new Date(),
            nextActionAt: scheduledFor,
            decisions: {
              create: {
                id: crypto.randomUUID(),
                failureCategory: decision.failureCategory,
                diagnosis: decision.diagnosis,
                recommendedAction: decision.recommendedAction,
                confidence: decision.confidence,
                estimatedRecoveryProbability:
                  decision.estimatedRecoveryProbability,
                merchantExplanation: decision.merchantExplanation,
                supportingEvidence: decision.supportingEvidence,
                riskFlags: decision.riskFlags,
                suggestedWaitMinutes:
                  decision.suggestedWaitMinutes ?? decision.waitMinutes,
                customerFriction: decision.customerFriction ?? "MEDIUM",
                urgency: decision.urgency ?? "MEDIUM",
                decisionProvider: analysis.provider,
                model: analysis.model,
                fallbackReason: analysis.fallbackReason,
                guardianDecision: guardian.decision,
                guardianReasons: guardian.reasons,
              },
            },
            actions: {
              create: {
                id: crypto.randomUUID(),
                type: actionType,
                status:
                  status === "STOPPED"
                    ? "CANCELLED"
                    : ["SCHEDULED", "PENDING_OBSERVATION"].includes(status)
                      ? "SCHEDULED"
                      : "PENDING",
                scheduledFor,
                metadata: {
                  simulated: input.provider !== "RAZORPAY",
                  injectFailure: Boolean(input.injectProviderFailure),
                  provider: input.provider,
                },
              },
            },
          },
        });
        if (providerOrder)
          await tx.providerOrder.update({
            where: { id: providerOrder.id },
            data: { status: "failed" },
          });
        await this.createAudit(
          tx,
          caseId,
          "PAYMENT",
          "PAYMENT_FAILED",
          input.provider === "RAZORPAY" ? "RAZORPAY" : "SIMULATOR",
          input.failureDescription ??
            failureDescriptionFor(decision.failureCategory),
          {
            providerEventId: input.providerEventId,
            amountPaise,
            providerOrderId: input.providerOrderId,
            failureCode: input.failureCode,
          },
        );
        await this.createAudit(
          tx,
          caseId,
          "RECOVERY",
          "RECOVERY_CASE_CREATED",
          "SYSTEM",
          `${caseId} entered the persistent recovery pipeline.`,
          { paymentId },
        );
        if (useAI)
          await this.createAudit(
            tx,
            caseId,
            "DECISION",
            "AI_ANALYSIS_REQUESTED",
            "PULSEBACK_AI",
            `${analysis.requestedProvider === "GROQ" ? "Groq" : "OpenAI"} recovery analysis was requested using a minimal, structured context.`,
            { model: analysis.model, provider: analysis.requestedProvider },
          );
        await this.createAudit(
          tx,
          caseId,
          "DECISION",
          analysis.provider !== "DETERMINISTIC"
            ? `${analysis.provider}_RECOMMENDATION_CREATED`
            : analysis.fallbackReason
              ? "AI_FALLBACK_USED"
              : "DETERMINISTIC_AUTOPSY_COMPLETED",
          "PULSEBACK_AI",
          analysis.fallbackReason
            ? `${analysis.requestedProvider === "GROQ" ? "Groq" : "OpenAI"} decision unavailable. Deterministic recovery engine used.`
            : decision.merchantExplanation,
          {
            decisionProvider: analysis.provider,
            model: analysis.model,
            fallbackReason: analysis.fallbackReason,
            recommendedAction: decision.recommendedAction,
            confidence: decision.confidence,
          },
        );
        await this.createAudit(
          tx,
          caseId,
          "GUARDIAN",
          `GUARDIAN_${guardian.decision}`,
          "GUARDIAN",
          `${guardian.decision === "APPROVED" ? "Guardian approved" : guardian.decision === "BLOCKED" ? "Guardian blocked" : "Guardian requires approval for"} ${analysis.provider === "GROQ" ? "Groq" : analysis.provider === "OPENAI" ? "OpenAI" : "deterministic"} recommendation. ${guardian.reasons.join(" · ")}`,
          { policies, decisionProvider: analysis.provider } as unknown as Prisma.InputJsonValue,
        );
        await markProcessed();
        return {
          ok: true,
          duplicate: false,
          eventId: input.providerEventId,
          caseId,
          message:
            "Event committed through payment, case, decision, Guardian, action and audit.",
        };
      }, { maxWait: 5_000, timeout: 12_000 });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        const existing = input.caseId
          ? await this.getCase(input.caseId)
          : input.providerPaymentId
            ? (await this.listCases()).find(
                (item) => item.paymentId === input.providerPaymentId,
              )
            : undefined;
        return {
          ok: true,
          duplicate: true,
          eventId: input.providerEventId,
          caseId: existing?.id ?? input.caseId,
          message:
            "Duplicate event ignored. No duplicate payment, case or action was created.",
        };
      }
      throw error;
    }
  }

  async reanalyzeCase(caseId: string): Promise<CaseCommandResult> {
    const prisma = await getPrisma();
    const recovery = await prisma.recoveryCase.findUnique({
      where: { id: caseId },
      include: caseInclude,
    });
    if (!recovery) throw new Error("Recovery case not found");
    if (["RECOVERED", "SELF_RECOVERED", "STOPPED"].includes(recovery.status))
      throw new Error("Completed or stopped cases cannot be re-analyzed");

    const policies = await this.getPolicies();
    const domain = toDomain(recovery);
    const now = new Date();
    const [contacts24h, contacts7d, previousRecoveries] = await Promise.all([
      prisma.recoveryAction.count({
        where: {
          recoveryCase: { customerId: recovery.customerId },
          executedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1_000) },
        },
      }),
      prisma.recoveryAction.count({
        where: {
          recoveryCase: { customerId: recovery.customerId },
          executedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000) },
        },
      }),
      prisma.recoveryCase.count({
        where: {
          customerId: recovery.customerId,
          status: { in: ["RECOVERED", "SELF_RECOVERED"] },
        },
      }),
    ]);
    const currentMemory = {
      ...domain.memory,
      contacts24h,
      contacts7d,
      previousRecoveries,
    };
    const context = buildRecoveryDecisionContext({
      transaction: {
        amountPaise: domain.amountPaise,
        currency: domain.currency,
        paymentMethod: domain.paymentMethod,
        failureCategory: domain.failureCategory,
        failureReason: domain.failureDescription,
        errorSource: recovery.payment.failureSource ?? undefined,
        errorStep: recovery.payment.failureStep ?? undefined,
        failedAt: recovery.payment.createdAt,
      },
      customer: {
        internalCustomerId: domain.customerId,
        successfulPayments: domain.memory.successfulPayments,
        failedPayments: domain.memory.failedPayments,
        previousRecoveries: currentMemory.previousRecoveries,
        contacts24h: currentMemory.contacts24h,
        contacts7d: currentMemory.contacts7d,
        fatigueScore: domain.memory.fatigueScore,
        lastContactAt: domain.memory.lastContactAt,
        preferredMethod: domain.memory.preferredMethod,
      },
      recovery: {
        status: domain.status,
        attempts: domain.attempts,
        previousActions: recovery.actions.map((action) => ({
          type: action.type,
          status: action.status,
        })),
        activePaymentLinkId: domain.activePaymentLinkId,
        nextActionAt: domain.nextActionAt,
      },
      policies,
      riskFlags: domain.riskFlags,
    });
    const analysis = await resolveRecoveryDecision(context, {
      useAI: true,
    });
    const decision = {
      ...analysis.decision,
      riskFlags: [
        ...new Set([
          ...analysis.decision.riskFlags,
          ...context.risk.knownRiskFlags,
        ]),
      ],
    };
    const guardian = evaluateGuardian(
      { ...domain, memory: currentMemory, riskFlags: decision.riskFlags },
      decision,
      policies,
    );
    const scored = scoreRecovery(domain.amountPaise, decision, currentMemory);
    const actionType = actionTypeFor(decision);
    const status =
      guardian.decision === "BLOCKED" || decision.recommendedAction === "STOP"
        ? "STOPPED"
        : policies.operatingMode === "SHADOW"
          ? "PLAN_READY"
          : "AWAITING_APPROVAL";

    await prisma.$transaction(async (tx) => {
      await tx.recoveryAction.updateMany({
        where: {
          recoveryCaseId: caseId,
          status: { in: ["PENDING", "SCHEDULED", "APPROVED"] },
        },
        data: {
          status: "CANCELLED",
          errorMessage: "Superseded by merchant-requested re-analysis.",
        },
      });
      await tx.recoveryCase.update({
        where: { id: caseId },
        data: {
          status,
          failureCategory: decision.failureCategory,
          diagnosis: decision.diagnosis,
          currentStrategy: actionType,
          predictedRecoveryProbability: decision.estimatedRecoveryProbability,
          opportunityScore: scored.score,
          expectedRecoverableValue: scored.expectedRecoverableValuePaise,
          nextActionAt: null,
        },
      });
      await tx.recoveryDecision.create({
        data: {
          id: crypto.randomUUID(),
          recoveryCaseId: caseId,
          failureCategory: decision.failureCategory,
          diagnosis: decision.diagnosis,
          recommendedAction: decision.recommendedAction,
          confidence: decision.confidence,
          estimatedRecoveryProbability: decision.estimatedRecoveryProbability,
          merchantExplanation: decision.merchantExplanation,
          supportingEvidence: decision.supportingEvidence,
          riskFlags: decision.riskFlags,
          suggestedWaitMinutes:
            decision.suggestedWaitMinutes ?? decision.waitMinutes,
          customerFriction: decision.customerFriction ?? "MEDIUM",
          urgency: decision.urgency ?? "MEDIUM",
          decisionProvider: analysis.provider,
          model: analysis.model,
          fallbackReason: analysis.fallbackReason,
          guardianDecision: guardian.decision,
          guardianReasons: guardian.reasons,
        },
      });
      if (!domain.activePaymentLinkId && status !== "STOPPED")
        await tx.recoveryAction.create({
          data: {
            id: crypto.randomUUID(),
            recoveryCaseId: caseId,
            type: actionType,
            status: "PENDING",
            metadata: {
              source: "REANALYSIS",
              requiresMerchantApproval: true,
              decisionProvider: analysis.provider,
            },
          },
        });
      await this.createAudit(
        tx,
        caseId,
        "DECISION",
        "RECOVERY_REANALYSIS_REQUESTED",
        "MERCHANT",
        "Merchant requested a fresh recovery analysis using current case context.",
        { model: analysis.model },
      );
      await this.createAudit(
        tx,
        caseId,
        "DECISION",
        analysis.provider !== "DETERMINISTIC"
          ? `${analysis.provider}_REANALYSIS_COMPLETED`
          : "REANALYSIS_FALLBACK_USED",
        "PULSEBACK_AI",
        analysis.fallbackReason
          ? `${analysis.requestedProvider === "GROQ" ? "Groq" : "OpenAI"} decision unavailable. Deterministic recovery engine used.`
          : decision.merchantExplanation,
        {
          decisionProvider: analysis.provider,
          model: analysis.model,
          fallbackReason: analysis.fallbackReason,
          recommendedAction: decision.recommendedAction,
          confidence: decision.confidence,
        },
      );
      await this.createAudit(
        tx,
        caseId,
        "GUARDIAN",
        `GUARDIAN_REANALYSIS_${guardian.decision}`,
        "GUARDIAN",
        `Guardian independently evaluated the new recommendation: ${guardian.decision}.`,
        { reasons: guardian.reasons },
      );
    });

    const updated = await this.getCase(caseId);
    if (!updated) throw new Error("Recovery case disappeared after re-analysis");
    return {
      ok: true,
      case: updated,
      message:
        analysis.provider !== "DETERMINISTIC"
          ? `${analysis.provider === "GROQ" ? "Groq" : "OpenAI"} re-analysis persisted. Guardian evaluated it; no action executed automatically.`
          : "Deterministic fallback re-analysis persisted. No action executed automatically.",
    };
  }

  async runCaseCommand(
    caseId: string,
    command: CaseCommand,
    reason?: string,
  ): Promise<CaseCommandResult> {
    if (command === "run") return this.executeNextAction(caseId);
    const prisma = await getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const recovery = await tx.recoveryCase.findUnique({
        where: { id: caseId },
        include: caseInclude,
      });
      if (!recovery) throw new Error("Recovery case not found");
      const pending = recovery.actions.find((a) =>
        ["PENDING", "SCHEDULED", "APPROVED"].includes(a.status),
      );
      if (command === "stop" || command === "reject") {
        if (
          ["RECOVERED", "SELF_RECOVERED", "STOPPED"].includes(recovery.status)
        )
          throw new Error(
            `Cannot ${command} a ${recovery.status.toLowerCase()} case`,
          );
        await tx.recoveryAction.updateMany({
          where: {
            recoveryCaseId: caseId,
            status: { in: ["PENDING", "SCHEDULED", "APPROVED"] },
          },
          data: {
            status: command === "reject" ? "REJECTED" : "CANCELLED",
            errorMessage: reason ?? "Merchant stopped recovery.",
          },
        });
        await tx.recoveryCase.update({
          where: { id: caseId },
          data: { status: "STOPPED", nextActionAt: null },
        });
        await this.createAudit(
          tx,
          caseId,
          "MERCHANT_ACTION",
          command === "reject" ? "ACTION_REJECTED" : "RECOVERY_STOPPED",
          "MERCHANT",
          reason ?? `Recovery ${command} persisted.`,
          {},
        );
        return {
          message:
            command === "reject"
              ? "Recommendation rejected and recovery stopped."
              : "Recovery stopped. No further actions will run.",
        };
      }
      if (command === "escalate") {
        if (["RECOVERED", "SELF_RECOVERED"].includes(recovery.status))
          throw new Error("Recovered cases cannot be escalated");
        await tx.recoveryCase.update({
          where: { id: caseId },
          data: { status: "ESCALATED", nextActionAt: null },
        });
        await this.createAudit(
          tx,
          caseId,
          "MERCHANT_ACTION",
          "RECOVERY_ESCALATED",
          "MERCHANT",
          reason ?? "Case escalated for manual review.",
          {},
        );
        return { message: "Recovery escalated for manual review." };
      }
      if (command === "approve") {
        if (recovery.status !== "AWAITING_APPROVAL" || !pending)
          throw new Error("This case is not awaiting approval");
        const scheduledFor = new Date();
        await tx.recoveryAction.update({
          where: { id: pending.id },
          data: { status: "SCHEDULED", scheduledFor },
        });
        await tx.recoveryCase.update({
          where: { id: caseId },
          data: { status: "SCHEDULED", nextActionAt: scheduledFor },
        });
        await this.createAudit(
          tx,
          caseId,
          "MERCHANT_ACTION",
          "ACTION_APPROVED",
          "MERCHANT",
          "Merchant approved the pending recovery action.",
          { actionId: pending.id },
        );
        return { message: "Action approved and scheduled." };
      }
      if (command === "run") {
        if (recovery.activePaymentLinkId)
          return {
            message: "Existing simulated Payment Link reused.",
            paymentLinkUrl: `https://rzp.io/i/demo-${caseId}`,
            reused: true,
          };
        if (!pending)
          throw new Error("No pending recovery action is available");
        const policies = await this.getPoliciesInTransaction(tx);
        const domain = toDomain(recovery);
        const guardian = guardianFor(
          domain.amountPaise,
          domain.memory,
          domain.decision,
          policies,
        );
        if (guardian.decision === "BLOCKED") {
          await tx.recoveryAction.update({
            where: { id: pending.id },
            data: {
              status: "SKIPPED",
              errorCode: "GUARDIAN_BLOCKED",
              errorMessage: guardian.reasons.join(" · "),
            },
          });
          await tx.recoveryCase.update({
            where: { id: caseId },
            data: { status: "STOPPED", nextActionAt: null },
          });
          await this.createAudit(
            tx,
            caseId,
            "GUARDIAN",
            "ACTION_BLOCKED",
            "GUARDIAN",
            guardian.reasons.join(" · "),
            { actionId: pending.id },
          );
          return { message: "Guardian blocked the action." };
        }
        const metadata =
          pending.metadata &&
          typeof pending.metadata === "object" &&
          !Array.isArray(pending.metadata)
            ? (pending.metadata as Record<string, unknown>)
            : {};
        if (metadata.injectFailure) {
          await tx.recoveryAction.update({
            where: { id: pending.id },
            data: {
              status: "FAILED",
              executedAt: new Date(),
              errorCode: "SIMULATED_PROVIDER_UNAVAILABLE",
              errorMessage: "Mock provider failure",
            },
          });
          await tx.recoveryCase.update({
            where: { id: caseId },
            data: { status: "ESCALATED", nextActionAt: null },
          });
          await this.createAudit(
            tx,
            caseId,
            "ACTION",
            "ACTION_FAILED",
            "SYSTEM",
            "Mock provider failed; no duplicate action was created and the case escalated.",
            { actionId: pending.id },
          );
          return {
            message: "Mock provider failed safely; the case was escalated.",
          };
        }
        if (pending.type === "CREATE_PAYMENT_LINK") {
          const providerReference = `plink_demo_${caseId}`;
          await tx.recoveryAction.update({
            where: { id: pending.id },
            data: {
              status: "SUCCEEDED",
              providerReference,
              executedAt: new Date(),
            },
          });
          await tx.recoveryCase.update({
            where: { id: caseId },
            data: {
              status: "RECOVERING",
              activePaymentLinkId: providerReference,
              attempts: { increment: 1 },
              nextActionAt: null,
            },
          });
          await this.createAudit(
            tx,
            caseId,
            "ACTION",
            "PAYMENT_LINK_CREATED",
            "SYSTEM",
            "One persistent DEMO/SIMULATED Payment Link was created.",
            { actionId: pending.id, providerReference },
          );
          return {
            message: "Simulated Payment Link created and persisted.",
            paymentLinkUrl: `https://rzp.io/i/demo-${caseId}`,
          };
        }
        await tx.recoveryAction.update({
          where: { id: pending.id },
          data: { status: "SUCCEEDED", executedAt: new Date() },
        });
        await tx.recoveryCase.update({
          where: { id: caseId },
          data: {
            status: "RECOVERING",
            attempts: { increment: 1 },
            nextActionAt: null,
          },
        });
        await this.createAudit(
          tx,
          caseId,
          "ACTION",
          "ACTION_EXECUTED",
          "SYSTEM",
          `${pending.type} executed by the mock provider.`,
          { actionId: pending.id },
        );
        return { message: "Next recovery action executed and persisted." };
      }
      throw new Error("Unsupported case command");
    });
    const updated = await this.getCase(caseId);
    if (!updated) throw new Error("Recovery case disappeared after mutation");
    return { ok: true, case: updated, ...result };
  }

  private async executeNextAction(caseId: string): Promise<CaseCommandResult> {
    const prisma = await getPrisma();
    const claim = await prisma.$transaction(async (tx) => {
      const recovery = await tx.recoveryCase.findUnique({
        where: { id: caseId },
        include: caseInclude,
      });
      if (!recovery) throw new Error("Recovery case not found");
      const activeLink = recovery.actions.find(
        (action) =>
          action.type === "CREATE_PAYMENT_LINK" &&
          action.providerReference &&
          ["created", "issued", "paid"].includes(
            action.providerStatus ?? "created",
          ),
      );
      if (recovery.activePaymentLinkId && activeLink)
        return { reused: true as const, recovery, action: activeLink };
      if (recovery.status === "AWAITING_APPROVAL")
        throw new Error("Merchant approval is required before execution");
      const pending = recovery.actions.find((action) =>
        ["PENDING", "SCHEDULED", "APPROVED"].includes(action.status),
      );
      if (!pending) {
        if (recovery.actions.some((action) => action.status === "EXECUTING"))
          throw new Error("Action execution is already in progress");
        throw new Error("No pending recovery action is available");
      }
      const policies = await this.getPoliciesInTransaction(tx);
      const domain = toDomain(recovery);
      const guardian = guardianFor(
        domain.amountPaise,
        domain.memory,
        domain.decision,
        policies,
      );
      if (guardian.decision === "BLOCKED") {
        await tx.recoveryAction.update({
          where: { id: pending.id },
          data: {
            status: "SKIPPED",
            errorCode: "GUARDIAN_BLOCKED",
            errorMessage: guardian.reasons.join(" · "),
          },
        });
        await tx.recoveryCase.update({
          where: { id: caseId },
          data: { status: "STOPPED", nextActionAt: null },
        });
        await this.createAudit(
          tx,
          caseId,
          "GUARDIAN",
          "ACTION_BLOCKED",
          "GUARDIAN",
          guardian.reasons.join(" · "),
          { actionId: pending.id },
        );
        return { blocked: true as const, recovery, action: pending };
      }
      if (pending.type === "SEND_EMAIL_REMINDER") {
        const claimed = await tx.recoveryAction.updateMany({
          where: {
            id: pending.id,
            status: { in: ["PENDING", "SCHEDULED", "APPROVED"] },
          },
          data: { status: "EXECUTING" },
        });
        if (claimed.count !== 1)
          throw new Error("Action execution is already in progress");
        return { notification: true as const, recovery, action: pending };
      }
      if (pending.type !== "CREATE_PAYMENT_LINK") {
        await tx.recoveryAction.update({
          where: { id: pending.id },
          data: {
            status: "SUCCEEDED",
            executedAt: new Date(),
            providerStatus: "simulated",
          },
        });
        await tx.recoveryCase.update({
          where: { id: caseId },
          data: {
            status: "RECOVERING",
            attempts: { increment: 1 },
            nextActionAt: null,
          },
        });
        await this.createAudit(
          tx,
          caseId,
          "ACTION",
          "ACTION_EXECUTED",
          "SYSTEM",
          `${pending.type} executed by the mock provider.`,
          { actionId: pending.id, simulated: true },
        );
        return { completed: true as const, recovery, action: pending };
      }
      const claimed = await tx.recoveryAction.updateMany({
        where: {
          id: pending.id,
          status: { in: ["PENDING", "SCHEDULED", "APPROVED"] },
        },
        data: { status: "EXECUTING" },
      });
      if (claimed.count !== 1)
        throw new Error("Action execution is already in progress");
      return { claimed: true as const, recovery, action: pending };
    });
    if ("reused" in claim) {
      const updated = await this.getCase(caseId);
      if (!updated) throw new Error("Recovery case disappeared after mutation");
      return {
        ok: true,
        case: updated,
        reused: true,
        message: "Existing active Payment Link reused.",
        paymentLinkUrl:
          claim.action.providerUrl ??
          (claim.recovery.payment.provider === "RAZORPAY"
            ? undefined
            : `https://rzp.io/i/demo-${caseId}`),
      };
    }
    if ("blocked" in claim || "completed" in claim) {
      const updated = await this.getCase(caseId);
      if (!updated) throw new Error("Recovery case disappeared after mutation");
      return {
        ok: true,
        case: updated,
        message:
          "blocked" in claim
            ? "Guardian blocked the action."
            : "Next recovery action executed and persisted.",
      };
    }
    if ("notification" in claim) {
      try {
        const delivery = await resolveNotificationProvider().sendRecoveryEmail({
          recoveryCaseId: caseId,
          customer: {
            name: claim.recovery.customer.name,
            email: claim.recovery.customer.email,
          },
          amountPaise: claim.recovery.payment.amount,
        });
        await prisma.$transaction(async (tx) => {
          await tx.recoveryAction.update({
            where: { id: claim.action.id },
            data: {
              status: "SUCCEEDED",
              executedAt: new Date(),
              providerReference: delivery.id,
              providerStatus: delivery.status,
              metadata: {
                simulated: delivery.simulated,
                provider: "mock-notification",
              },
            },
          });
          await tx.recoveryCase.update({
            where: { id: caseId },
            data: {
              status: "RECOVERING",
              attempts: { increment: 1 },
              nextActionAt: null,
            },
          });
          await this.createAudit(
            tx,
            caseId,
            "NOTIFICATION",
            "RECOVERY_EMAIL_SIMULATED",
            "SYSTEM",
            "Recovery email delivery was simulated; no message left PulseBack.",
            { actionId: claim.action.id, simulated: true },
          );
        });
        const updated = await this.getCase(caseId);
        if (!updated)
          throw new Error("Recovery case disappeared after mutation");
        return {
          ok: true,
          case: updated,
          message: "Recovery email was simulated and persisted.",
        };
      } catch (error) {
        await prisma.$transaction(async (tx) => {
          await tx.recoveryAction.update({
            where: { id: claim.action.id },
            data: {
              status: "FAILED",
              executedAt: new Date(),
              errorCode: "NOTIFICATION_PROVIDER_FAILURE",
              errorMessage: "Notification provider failed",
            },
          });
          await tx.recoveryCase.update({
            where: { id: caseId },
            data: { status: "ESCALATED", nextActionAt: null },
          });
          await this.createAudit(
            tx,
            caseId,
            "NOTIFICATION",
            "RECOVERY_EMAIL_FAILED",
            "SYSTEM",
            "Notification provider failed safely; the case was escalated.",
            { actionId: claim.action.id },
          );
        });
        console.error('[PulseBack:notification-provider]', {
          name: error instanceof Error ? error.name : typeof error,
        });
        const updated = await this.getCase(caseId);
        if (!updated)
          throw new Error("Recovery case disappeared after mutation");
        return {
          ok: true,
          case: updated,
          message: "Notification provider failed safely; the case was escalated.",
        };
      }
    }
    const metadata =
      claim.action.metadata &&
      typeof claim.action.metadata === "object" &&
      !Array.isArray(claim.action.metadata)
        ? (claim.action.metadata as Record<string, unknown>)
        : {};
    try {
      const selection = resolvePaymentProvider({
        preferRazorpay: claim.recovery.payment.provider === "RAZORPAY",
        injectFailure: Boolean(metadata.injectFailure),
      });
      const referenceId = `pulseback_recovery_${caseId}`;
      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();
      const link = await selection.provider.createPaymentLink({
        amountPaise: claim.recovery.payment.amount,
        referenceId,
        customer: {
          name: claim.recovery.customer.name,
          email: claim.recovery.customer.email,
        },
        expiresAt,
        callbackUrl: absoluteSiteUrl(`/recoveries/${caseId}`),
        notes: {
          pulseback_case_id: caseId,
          pulseback_payment_id: claim.recovery.paymentId,
          pulseback_merchant_id: merchantId,
        },
      });
      await prisma.$transaction(async (tx) => {
        await tx.recoveryAction.update({
          where: { id: claim.action.id },
          data: {
            status: "SUCCEEDED",
            providerReference: link.id,
            providerUrl: link.shortUrl,
            providerStatus: link.status,
            providerExpiresAt: link.expiresAt ? new Date(link.expiresAt) : null,
            executedAt: new Date(),
            metadata: {
              ...metadata,
              provider: selection.kind,
              referenceId,
            } as Prisma.InputJsonValue,
          },
        });
        await tx.recoveryCase.update({
          where: { id: caseId },
          data: {
            status: "RECOVERING",
            activePaymentLinkId: link.id,
            attempts: { increment: 1 },
            nextActionAt: null,
          },
        });
        await this.createAudit(
          tx,
          caseId,
          "ACTION",
          selection.kind === "razorpay-test"
            ? "RAZORPAY_TEST_PAYMENT_LINK_CREATED"
            : "PAYMENT_LINK_CREATED",
          "SYSTEM",
          `${selection.kind === "razorpay-test" ? "Razorpay Test" : "DEMO/SIMULATED"} Payment Link created for ${formatInrPaise(link.amountPaise)}.`,
          {
            actionId: claim.action.id,
            providerReference: link.id,
            referenceId,
            simulated: selection.kind !== "razorpay-test",
          },
        );
      });
      const updated = await this.getCase(caseId);
      if (!updated) throw new Error("Recovery case disappeared after mutation");
      return {
        ok: true,
        case: updated,
        message: `${selection.kind === "razorpay-test" ? "Razorpay Test" : "Simulated"} Payment Link created and persisted.`,
        paymentLinkUrl: link.shortUrl,
      };
    } catch (error) {
      const providerError =
        error instanceof RazorpayProviderError
          ? error
          : new RazorpayProviderError(
              error instanceof Error ? error.message : "Provider action failed",
            );
      await prisma.$transaction(async (tx) => {
        await tx.recoveryAction.update({
          where: { id: claim.action.id },
          data: {
            status: "FAILED",
            executedAt: new Date(),
            errorCode: providerError.code ?? "PROVIDER_FAILURE",
            errorMessage: providerError.message,
          },
        });
        await tx.recoveryCase.update({
          where: { id: caseId },
          data: { status: "ESCALATED", nextActionAt: null },
        });
        await this.createAudit(
          tx,
          caseId,
          "ACTION",
          "ACTION_FAILED",
          "SYSTEM",
          `${metadata.injectFailure ? "Injected failure test" : "Payment provider action"} failed safely; no duplicate link was created and the case escalated.`,
          { actionId: claim.action.id, errorCode: providerError.code },
        );
      });
      const updated = await this.getCase(caseId);
      if (!updated) throw new Error("Recovery case disappeared after mutation");
      return {
        ok: true,
        case: updated,
        message: "Provider failed safely; the case was escalated.",
      };
    }
  }

  async processDueActions(now = new Date()): Promise<DueActionResult> {
    const prisma = await getPrisma();
    const due = await prisma.recoveryAction.findMany({
      where: { status: "SCHEDULED", scheduledFor: { lte: now } },
      select: { id: true, recoveryCaseId: true },
    });
    const result = {
      processed: due.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };
    for (const action of due) {
      try {
        const outcome = await this.runCaseCommand(action.recoveryCaseId, "run");
        if (outcome.case.status === "ESCALATED") result.failed++;
        else if (outcome.case.status === "STOPPED") result.skipped++;
        else result.succeeded++;
      } catch {
        result.failed++;
      }
    }
    return result;
  }

  async getDashboard(
    prefetchedCases?: RecoveryCase[],
  ): Promise<DashboardSnapshot> {
    const cases = prefetchedCases ?? (await this.listCases());
    const recovered = cases.filter((c) =>
      ["RECOVERED", "SELF_RECOVERED"].includes(c.status),
    );
    const atRisk = cases
      .filter((c) => !["RECOVERED", "SELF_RECOVERED"].includes(c.status))
      .reduce((sum, c) => sum + c.amountPaise, 0);
    const recoveredPaise = recovered.reduce(
      (sum, c) => sum + c.recoveredAmountPaise,
      0,
    );
    const needs = cases.filter((c) => c.status === "AWAITING_APPROVAL");
    const pulseMap = new Map<
      string,
      { date: string; atRisk: number; recovered: number }
    >();
    for (const c of cases) {
      const date = c.createdAt.slice(5, 10);
      const row = pulseMap.get(date) ?? { date, atRisk: 0, recovered: 0 };
      row.atRisk += c.amountPaise / 100;
      row.recovered += c.recoveredAmountPaise / 100;
      pulseMap.set(date, row);
    }
    const strategyMap = new Map<string, number>();
    for (const c of recovered)
      strategyMap.set(
        c.currentStrategy,
        (strategyMap.get(c.currentStrategy) ?? 0) +
          c.recoveredAmountPaise / 100,
      );
    return {
      revenueAtRiskPaise: atRisk,
      revenueRecoveredPaise: recoveredPaise,
      recoveryRate:
        atRisk + recoveredPaise
          ? recoveredPaise / (atRisk + recoveredPaise)
          : 0,
      activeRecoveries: cases.filter((c) => activeStatuses.has(c.status))
        .length,
      selfRecoveredPaise: cases
        .filter((c) => c.status === "SELF_RECOVERED")
        .reduce((sum, c) => sum + c.recoveredAmountPaise, 0),
      selfRecoveredCount: cases.filter((c) => c.status === "SELF_RECOVERED")
        .length,
      needsApproval: needs.length,
      needsApprovalPaise: needs.reduce((sum, c) => sum + c.amountPaise, 0),
      expectedRecoveryPaise: cases
        .filter((c) => activeStatuses.has(c.status))
        .reduce((sum, c) => sum + c.expectedRecoverableValuePaise, 0),
      recoveredCount: recovered.length,
      opportunityQueue: cases
        .filter((c) => activeStatuses.has(c.status))
        .slice(0, 4),
      recentActivity: (await this.listAuditEvents()).slice(0, 5),
      pulse: [...pulseMap.values()].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      effectiveness: [...strategyMap].map(([strategy, recoveredAmount]) => ({
        strategy: strategy.replaceAll("_", " "),
        recovered: recoveredAmount,
      })),
    };
  }

  async saveEvaluation(result: EvaluationResult) {
    const prisma = await getPrisma();
    const row = await prisma.evaluationRun.create({
      data: {
        id: crypto.randomUUID(),
        seed: result.seed,
        caseCount: result.caseCount,
        revenueAtRisk: result.revenueAtRiskPaise,
        baselineRecovered: result.baseline.recoveredPaise,
        pulseBackRecovered: result.pulseBack.recoveredPaise,
        metrics: result as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      id: row.id,
      seed: row.seed,
      caseCount: row.caseCount,
      revenueAtRiskPaise: row.revenueAtRisk,
      baselineRecoveredPaise: row.baselineRecovered,
      pulseBackRecoveredPaise: row.pulseBackRecovered,
      createdAt: row.createdAt.toISOString(),
    };
  }
  async listEvaluationRuns(limit = 5): Promise<EvaluationRunSummary[]> {
    const prisma = await getPrisma();
    const rows = await prisma.evaluationRun.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      seed: row.seed,
      caseCount: row.caseCount,
      revenueAtRiskPaise: row.revenueAtRisk,
      baselineRecoveredPaise: row.baselineRecovered,
      pulseBackRecoveredPaise: row.pulseBackRecovered,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async getPoliciesInTransaction(
    tx: Prisma.TransactionClient,
  ): Promise<GuardianPolicies> {
    const policy = await tx.policy.findUnique({ where: { merchantId } });
    return policy
      ? {
          operatingMode: policy.operatingMode,
          autonomousAmountThresholdPaise: policy.autonomousAmountThresholdPaise,
          observationWindowMinutes: policy.observationWindowMinutes,
          maxAttemptsPerCase: policy.maxAttemptsPerCase,
          contactsPer24h: policy.contactsPer24h,
          contactsPer7d: policy.contactsPer7d,
          minimumConfidence: policy.minimumConfidence,
          highRiskAutoStop: policy.highRiskAutoStop,
          newCustomerApprovalThresholdPaise:
            policy.newCustomerApprovalThresholdPaise,
          preventRepeatedAction: policy.preventRepeatedAction,
          fatigueStopThreshold: policy.fatigueStopThreshold,
        }
      : { ...DEFAULT_POLICIES };
  }
  private async createAudit(
    tx: Prisma.TransactionClient,
    recoveryCaseId: string | null,
    category: string,
    eventType: string,
    actorName: string,
    message: string,
    metadata: Prisma.InputJsonValue,
  ) {
    await tx.auditEvent.create({
      data: {
        id: crypto.randomUUID(),
        merchantId,
        recoveryCaseId,
        category,
        eventType,
        actor: actorName,
        message,
        metadata,
      },
    });
  }
}
