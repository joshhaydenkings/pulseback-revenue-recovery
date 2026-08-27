import { getAIIntegrationStatus } from './ai-integration-service';
import { getDatabaseHealthStatus } from './database-health-service';
import { getRazorpayIntegrationStatus } from './razorpay-integration-service';
import { getNotificationIntegrationStatus } from './notification-integration-service';
import { getSiteUrl, publicSiteUrlConfigured } from '../lib/site-url';

export async function getSystemReadiness() {
  const [database, razorpay, ai, email] = await Promise.all([
    getDatabaseHealthStatus(),
    getRazorpayIntegrationStatus(),
    getAIIntegrationStatus(),
    getNotificationIntegrationStatus(),
  ]);
  const publicSiteConfigured = publicSiteUrlConfigured();
  const ready =
    database.status === 'connected' &&
    razorpay.status === 'connected' &&
    razorpay.webhookConfigured &&
    ai.status === 'connected' &&
    email.configured &&
    publicSiteConfigured;
  return {
    status: ready ? ('ready' as const) : ('degraded' as const),
    site: {
      configured: publicSiteConfigured,
      origin: getSiteUrl().origin,
    },
    database: {
      provider: database.provider,
      status: database.status,
      driver: database.driver,
      runtime: database.runtime,
      lastRecoveryAt: database.lastRecoveryAt ?? null,
    },
    razorpay: {
      provider: 'Razorpay',
      mode: 'TEST' as const,
      status: razorpay.status,
      webhookConfigured: razorpay.webhookConfigured,
      lastWebhookAt: razorpay.lastWebhookAt,
      lastRecoveryAt: razorpay.lastRecoveryAt,
    },
    ai: {
      provider: ai.provider,
      status: ai.status,
      model: ai.model,
      lastSuccessfulDecisionAt: ai.lastSuccessfulAIDecision ?? null,
    },
    email: {
      provider: email.activeProvider === 'resend' ? 'Resend' : 'Mock',
      status: email.configured ? ('connected' as const) : ('simulated' as const),
      testRecipientConfigured: email.testRecipientConfigured,
      lastSentAt: email.lastSentAt,
    },
  };
}
