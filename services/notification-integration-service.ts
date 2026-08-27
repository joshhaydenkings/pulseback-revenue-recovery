import "server-only";
import { databaseConfigured, getPrisma } from "../lib/db/prisma";
import {
  configuredTestRecipient,
  getNotificationConfiguration,
  resolveNotificationProvider,
} from "../lib/notifications/notification-provider";
import { maskEmail } from "../lib/notifications/recovery-email-template";

export async function getNotificationIntegrationStatus() {
  const config = getNotificationConfiguration();
  if (!databaseConfigured())
    return {
      ...config,
      sent: 0,
      failed: 0,
      lastSentAt: null as string | null,
      storage: "demo-memory" as const,
    };
  try {
    const prisma = await getPrisma();
    const [sent, failed, latest] = await Promise.all([
      prisma.notification.count({
        where: { status: { in: ["SENT", "DELIVERED"] } },
      }),
      prisma.notification.count({ where: { status: "FAILED" } }),
      prisma.notification.findFirst({
        where: { status: { in: ["SENT", "DELIVERED"] } },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      }),
    ]);
    return {
      ...config,
      sent,
      failed,
      lastSentAt: latest?.sentAt?.toISOString() ?? null,
      storage: "postgresql" as const,
    };
  } catch {
    return {
      ...config,
      sent: 0,
      failed: 0,
      lastSentAt: null as string | null,
      storage: "unavailable" as const,
    };
  }
}

export async function sendConfiguredTestEmail() {
  const recipient = configuredTestRecipient();
  const config = getNotificationConfiguration();
  if (!config.configured || !recipient)
    throw new Error(
      "Configure Resend and EMAIL_TEST_RECIPIENT before sending a test email.",
    );
  const provider = resolveNotificationProvider({ allowReal: true });
  const delivery = await provider.sendEmail({
    to: recipient,
    subject: "PulseBack notification connection test",
    html: '<div style="font-family:Arial,sans-serif"><h1>PulseBack email is connected</h1><p>This fixed test message contains no customer or payment data.</p></div>',
    text: "PulseBack email is connected. This fixed test message contains no customer or payment data.",
    idempotencyKey: `pulseback:notification-test:${Math.floor(Date.now() / 60000)}`,
  });
  return {
    ok: true,
    status: "SENT" as const,
    recipient: maskEmail(recipient),
    providerMessageId: delivery.id,
    message: "Test email accepted by Resend. This does not prove inbox delivery.",
  };
}
