import { getPrisma, databaseConfigured } from "../lib/db/prisma";
import {
  getRazorpayConfiguration,
  publicRazorpayConfiguration,
} from "../lib/razorpay/config";

const merchantId = "merchant_demo";

export async function recordRazorpayAudit(
  eventType: string,
  message: string,
  metadata: Record<string, unknown> = {},
) {
  if (!databaseConfigured()) return;
  const prisma = await getPrisma();
  await prisma.auditEvent.create({
    data: {
      id: crypto.randomUUID(),
      merchantId,
      category: "RAZORPAY",
      eventType,
      actor: "RAZORPAY",
      message,
      metadata: JSON.parse(JSON.stringify(metadata)),
    },
  });
}

export async function getRazorpayIntegrationStatus() {
  const safe = publicRazorpayConfiguration();
  if (!databaseConfigured())
    return {
      ...safe,
      storage: "demo-memory",
      lastWebhookEvent: null,
      lastWebhookAt: null,
      ordersCreated: 0,
      recoveryLinksCreated: 0,
      successfulRecoveries: 0,
    };
  const prisma = await getPrisma();
  const [
    lastWebhook,
    ordersCreated,
    recoveryLinksCreated,
    successfulRecoveries,
  ] = await Promise.all([
    prisma.webhookEvent.findFirst({
      where: { provider: "RAZORPAY" },
      orderBy: { createdAt: "desc" },
      select: { eventType: true, createdAt: true },
    }),
    prisma.providerOrder.count({ where: { merchantId, provider: "RAZORPAY" } }),
    prisma.recoveryAction.count({
      where: { providerReference: { startsWith: "plink_" } },
    }),
    prisma.recoveryCase.count({
      where: { status: "RECOVERED", payment: { provider: "RAZORPAY" } },
    }),
  ]);
  return {
    ...safe,
    storage: "postgresql",
    lastWebhookEvent: lastWebhook?.eventType ?? null,
    lastWebhookAt: lastWebhook?.createdAt.toISOString() ?? null,
    ordersCreated,
    recoveryLinksCreated,
    successfulRecoveries,
  };
}

export function requireRazorpayTestConfiguration(
  options: { webhook?: boolean } = {},
) {
  const config = getRazorpayConfiguration();
  if (config.status !== "connected")
    throw new Error(config.reason ?? "Razorpay Test Mode is not configured.");
  if (options.webhook && !config.webhookSecret)
    throw new Error(
      "RAZORPAY_WEBHOOK_SECRET is required for verified Razorpay webhooks.",
    );
  return config;
}
