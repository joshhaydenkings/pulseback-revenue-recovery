import "server-only";
import { Prisma } from "../generated/prisma/client";
import { getPrisma } from "../lib/db/prisma";
import {
  getNotificationConfiguration,
  NotificationProviderError,
  resolveNotificationProvider,
} from "../lib/notifications/notification-provider";
import {
  maskEmail,
  RECOVERY_EMAIL_TEMPLATE,
  renderRecoveryEmail,
} from "../lib/notifications/recovery-email-template";
import type {
  RecoveryEmailPreview,
  RecoveryEmailResult,
} from "../repositories/types";

const merchantId = "merchant_demo";
const terminalStatuses = new Set([
  "RECOVERED",
  "SELF_RECOVERED",
  "STOPPED",
  "FAILED",
  "ESCALATED",
]);
const contactedStatuses = ["SENT", "DELIVERED"] as const;

const emailCaseInclude = {
  customer: true,
  payment: true,
  merchant: true,
  decisions: { orderBy: { createdAt: "desc" as const }, take: 1 },
  actions: { orderBy: { createdAt: "desc" as const } },
  notifications: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.RecoveryCaseInclude;

type EmailCase = Prisma.RecoveryCaseGetPayload<{
  include: typeof emailCaseInclude;
}>;

function emailIsValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !/[\r\n]/.test(value);
}

function activeLink(recovery: EmailCase) {
  return recovery.actions.find(
    (action) =>
      action.type === "CREATE_PAYMENT_LINK" &&
      action.providerReference === recovery.activePaymentLinkId &&
      Boolean(action.providerUrl) &&
      ["created", "issued"].includes(action.providerStatus ?? "created") &&
      (!action.providerExpiresAt || action.providerExpiresAt > new Date()),
  );
}

async function loadEmailCase(caseId: string) {
  const prisma = await getPrisma();
  const recovery = await prisma.recoveryCase.findFirst({
    where: { id: caseId, merchantId },
    include: emailCaseInclude,
  });
  if (!recovery) throw new Error("Recovery case not found");
  return recovery;
}

async function safetyCheck(recovery: EmailCase) {
  const prisma = await getPrisma();
  const policy = await prisma.policy.findUnique({ where: { merchantId } });
  const reasons: string[] = [];
  const link = activeLink(recovery);
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [contacts24h, contacts7d] = await Promise.all([
    prisma.notification.count({
      where: {
        customerId: recovery.customerId,
        status: { in: [...contactedStatuses] },
        sentAt: { gte: dayAgo },
      },
    }),
    prisma.notification.count({
      where: {
        customerId: recovery.customerId,
        status: { in: [...contactedStatuses] },
        sentAt: { gte: weekAgo },
      },
    }),
  ]);
  if (!emailIsValid(recovery.customer.email)) reasons.push("Customer email is invalid");
  if (terminalStatuses.has(recovery.status)) reasons.push(`Case is ${recovery.status.toLowerCase()}`);
  if (recovery.merchant.operatingMode === "SHADOW") reasons.push("Shadow mode prevents customer contact");
  if (!link?.providerUrl) reasons.push("No active persisted Razorpay Payment Link");
  if (!policy) reasons.push("Guardian policy is unavailable");
  if (policy && recovery.attempts >= policy.maxAttemptsPerCase)
    reasons.push("Maximum recovery attempts reached");
  if (policy && contacts24h >= policy.contactsPer24h)
    reasons.push("24-hour contact limit reached");
  if (policy && contacts7d >= policy.contactsPer7d)
    reasons.push("7-day contact limit reached");
  if (policy && recovery.customer.recoveryFatigueScore >= policy.fatigueStopThreshold)
    reasons.push("Customer fatigue threshold reached");
  if (recovery.decisions[0]?.guardianDecision === "BLOCKED")
    reasons.push("Guardian blocked the recovery decision");
  return { reasons, link, contacts24h, contacts7d };
}

function notificationKey(caseId: string, paymentLinkId: string) {
  return `pulseback:${caseId}:${paymentLinkId}:recovery-email-v1`.slice(0, 256);
}

export async function getPostgresRecoveryEmailPreview(
  caseId: string,
): Promise<RecoveryEmailPreview> {
  const recovery = await loadEmailCase(caseId);
  const safety = await safetyCheck(recovery);
  if (!safety.link?.providerUrl)
    throw new Error("Create a persisted Razorpay Payment Link before previewing email");
  const rendered = renderRecoveryEmail({
    customerName: recovery.customer.name,
    amountPaise: recovery.payment.amount,
    paymentLinkUrl: safety.link.providerUrl,
  });
  const existing = recovery.notifications.find(
    (item) =>
      item.idempotencyKey ===
      notificationKey(recovery.id, safety.link!.providerReference!),
  );
  return {
    caseId,
    recipient: maskEmail(recovery.customer.email),
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    paymentLinkUrl: safety.link.providerUrl,
    amountPaise: recovery.payment.amount,
    provider: getNotificationConfiguration().activeProvider,
    canSend: safety.reasons.length === 0,
    blockedReasons: safety.reasons,
    previousStatus: existing?.status,
    previousSentAt: existing?.sentAt?.toISOString(),
  };
}

export async function sendPostgresRecoveryEmail(
  caseId: string,
): Promise<RecoveryEmailResult> {
  const prisma = await getPrisma();
  const recovery = await loadEmailCase(caseId);
  const safety = await safetyCheck(recovery);
  if (safety.reasons.length || !safety.link?.providerUrl || !safety.link.providerReference) {
    await prisma.auditEvent.create({
      data: {
        id: crypto.randomUUID(), merchantId, recoveryCaseId: caseId,
        category: "NOTIFICATION", eventType: "RECOVERY_EMAIL_SUPPRESSED",
        actor: "GUARDIAN", message: "Recovery email was suppressed by pre-send safety checks.",
        metadata: { reasons: safety.reasons },
      },
    });
    return { ok: true, status: "SUPPRESSED", provider: getNotificationConfiguration().activeProvider, message: safety.reasons.join(" · ") || "Recovery email suppressed" };
  }
  const rendered = renderRecoveryEmail({
    customerName: recovery.customer.name,
    amountPaise: recovery.payment.amount,
    paymentLinkUrl: safety.link.providerUrl,
  });
  const idempotencyKey = notificationKey(caseId, safety.link.providerReference);
  const config = getNotificationConfiguration();
  const provider = resolveNotificationProvider({ allowReal: true });
  const claim = await prisma.$transaction(async (tx) => {
    const existing = await tx.notification.findUnique({ where: { idempotencyKey } });
    if (
      existing &&
      (["SENT", "DELIVERED", "SENDING"].includes(existing.status) ||
        (existing.status === "SUPPRESSED" &&
          existing.errorCode === "MOCK_PROVIDER" &&
          provider.kind === "mock"))
    ) {
      await tx.auditEvent.create({
        data: {
          id: crypto.randomUUID(), merchantId, recoveryCaseId: caseId,
          category: "NOTIFICATION", eventType: "DUPLICATE_RECOVERY_EMAIL_IGNORED",
          actor: "SYSTEM", message: "Duplicate recovery email request ignored.",
          metadata: { notificationId: existing.id, status: existing.status },
        },
      });
      return { duplicate: existing } as const;
    }
    if (existing && existing.attemptCount >= existing.maxAttempts && existing.status === "FAILED")
      return { exhausted: existing } as const;
    const action = recovery.actions.find(
      (item) =>
        item.type === "SEND_EMAIL_REMINDER" &&
        (Boolean(existing) ||
          ["PENDING", "SCHEDULED", "APPROVED", "EXECUTING"].includes(
            item.status,
          )),
    );
    const notification = existing
      ? await tx.notification.update({
          where: { id: existing.id },
          data: { status: "SENDING", provider: provider.kind, providerMessageId: null, attemptCount: { increment: 1 }, errorCode: null, errorMessage: null, failedAt: null, nextRetryAt: null },
        })
      : await tx.notification.create({
          data: {
            id: crypto.randomUUID(), merchantId, customerId: recovery.customerId,
            recoveryCaseId: caseId, provider: provider.kind,
            recipientMasked: maskEmail(recovery.customer.email), idempotencyKey,
            status: "SENDING", attemptCount: 1,
            metadata: { paymentLinkId: safety.link!.providerReference, amountPaise: recovery.payment.amount },
          },
        });
    const recoveryAction = action
      ? await tx.recoveryAction.update({ where: { id: action.id }, data: { status: "EXECUTING", scheduledFor: null, errorCode: null, errorMessage: null } })
      : await tx.recoveryAction.create({ data: { id: crypto.randomUUID(), recoveryCaseId: caseId, type: "SEND_EMAIL_REMINDER", status: "EXECUTING", metadata: { notificationId: notification.id, template: RECOVERY_EMAIL_TEMPLATE } } });
    return { notification, action: recoveryAction } as const;
  }).catch(async (error: unknown) => {
    const candidate = error as { code?: string };
    if (candidate.code !== "P2002") throw error;
    const existing = await prisma.notification.findUnique({
      where: { idempotencyKey },
    });
    if (!existing) throw error;
    return { duplicate: existing } as const;
  });
  if (claim.duplicate)
    return { ok: true, status: "DUPLICATE", provider: claim.duplicate.provider as "mock" | "resend", providerMessageId: claim.duplicate.providerMessageId ?? undefined, message: "Recovery email was already accepted; no duplicate was sent." };
  if (claim.exhausted)
    return { ok: true, status: "FAILED", provider: claim.exhausted.provider as "mock" | "resend", message: "Recovery email retry limit has been reached." };
  try {
    const delivery = await provider.sendEmail({
      to: recovery.customer.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey,
    });
    const sentAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.notification.update({
        where: { id: claim.notification.id },
        data: delivery.simulated
          ? { status: "SUPPRESSED", providerMessageId: delivery.id, errorCode: "MOCK_PROVIDER", errorMessage: config.reason ?? "Mock notification provider active" }
          : { status: "SENT", providerMessageId: delivery.id, sentAt },
      });
      await tx.recoveryAction.update({
        where: { id: claim.action.id },
        data: { status: "SUCCEEDED", executedAt: sentAt, providerReference: delivery.id, providerStatus: delivery.status, metadata: { provider: delivery.provider, simulated: delivery.simulated, notificationId: claim.notification.id } },
      });
      if (!delivery.simulated) {
        await tx.customer.update({
          where: { id: recovery.customerId },
          data: { lastContactAt: sentAt, recoveryFatigueScore: { increment: 5 } },
        });
      }
      await tx.auditEvent.create({
        data: {
          id: crypto.randomUUID(), merchantId, recoveryCaseId: caseId,
          category: "NOTIFICATION", eventType: delivery.simulated ? "RECOVERY_EMAIL_SIMULATED" : "RECOVERY_EMAIL_SENT",
          actor: "SYSTEM", message: delivery.simulated ? "Recovery email was simulated; no message left PulseBack." : "Recovery email was accepted by the email provider.",
          metadata: { notificationId: claim.notification.id, provider: delivery.provider, providerMessageId: delivery.id, recipient: maskEmail(recovery.customer.email) },
        },
      });
    });
    return { ok: true, status: delivery.simulated ? "SIMULATED" : "SENT", provider: delivery.provider, providerMessageId: delivery.id, message: delivery.simulated ? "Email simulated. Configure Resend to send externally." : "Recovery email accepted by Resend. Delivery is not claimed until provider confirmation." };
  } catch (error) {
    const attempt = claim.notification.attemptCount;
    const exhausted = attempt >= claim.notification.maxAttempts;
    const nextRetryAt = exhausted ? null : new Date(Date.now() + 5 * 60 * 1000);
    const providerError = error instanceof NotificationProviderError ? error : undefined;
    await prisma.$transaction(async (tx) => {
      await tx.notification.update({ where: { id: claim.notification.id }, data: { status: "FAILED", failedAt: new Date(), nextRetryAt, errorCode: providerError?.code ?? "NOTIFICATION_PROVIDER_FAILURE", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Notification provider failed" } });
      await tx.recoveryAction.update({ where: { id: claim.action.id }, data: { status: exhausted ? "FAILED" : "SCHEDULED", scheduledFor: nextRetryAt, errorCode: providerError?.code ?? "NOTIFICATION_PROVIDER_FAILURE", errorMessage: "Email provider request failed" } });
      if (exhausted) await tx.recoveryCase.update({ where: { id: caseId }, data: { status: "ESCALATED", nextActionAt: null } });
      await tx.auditEvent.create({ data: { id: crypto.randomUUID(), merchantId, recoveryCaseId: caseId, category: "NOTIFICATION", eventType: exhausted ? "RECOVERY_EMAIL_FAILED" : "RECOVERY_EMAIL_RETRY_SCHEDULED", actor: "SYSTEM", message: exhausted ? "Recovery email failed after the bounded retry limit; case escalated." : "Recovery email provider failed; one bounded retry was scheduled.", metadata: { notificationId: claim.notification.id, attempt, nextRetryAt: nextRetryAt?.toISOString(), code: providerError?.code } } });
    });
    return { ok: true, status: "FAILED", provider: provider.kind, message: exhausted ? "Email failed after two attempts; the case was escalated." : "Email failed safely; one retry was scheduled." };
  }
}
