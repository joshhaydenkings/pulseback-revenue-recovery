import {
  Bot,
  Check,
  Copy,
  Database,
  ExternalLink,
  Mail,
  PlugZap,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { PageHeader } from "../../components/page-header";
import { getRazorpayIntegrationStatus } from "../../services/razorpay-integration-service";
import { getAIIntegrationStatus } from "../../services/ai-integration-service";
import { getDatabaseHealthStatus } from "../../services/database-health-service";
import { getNotificationIntegrationStatus } from "../../services/notification-integration-service";
import { NotificationTestButton } from "../../components/interactive/notification-test-button";
import {
  publicSiteUrlConfigured,
  razorpayWebhookUrl,
} from "../../lib/site-url";

export default async function Integrations() {
  const [database, razor, ai, notifications] = await Promise.all([
    getDatabaseHealthStatus(),
    getRazorpayIntegrationStatus(),
    getAIIntegrationStatus(),
    getNotificationIntegrationStatus(),
  ]);
  const connected = razor.status === "connected";
  const razorState = connected
    ? "connected"
    : razor.status === "demo"
      ? "demo"
      : "unavailable";
  const aiState = ai.status === "connected" ? "connected" : "demo";
  return (
    <AppShell active="Integrations">
      <PageHeader
        eyebrow="Server-side credentials only"
        title="Integrations"
        description="Connect recovery providers while keeping financial secrets outside client-side JavaScript."
      />
      <div className="integration-grid">
        <Integration
          name="Database"
          icon={<Database />}
          state={database.status}
          badge={database.status === "connected" ? "CONNECTED" : database.status === "demo" ? "DEMO" : "UNAVAILABLE"}
          description={database.status === "connected" ? "PostgreSQL is the authoritative recovery store." : database.status === "demo" ? "In-memory demo fallback is active. State resets on restart." : "PostgreSQL is configured but currently unavailable."}
          rows={[
            ["Provider", "PostgreSQL"],
            ["Connection", database.status === "connected" ? "Connected" : database.status === "demo" ? "Demo fallback" : "Unavailable"],
            ["Driver", database.driver === "neon" ? "Neon serverless" : "PostgreSQL TCP"],
            ["Runtime", database.runtime],
            ["Last recovery", database.lastRecoveryAt ? new Date(database.lastRecoveryAt).toLocaleString("en-IN") : "â€”"],
          ]}
          env={["DATABASE_URL", "DIRECT_URL", "DATABASE_DRIVER", "DATABASE_RUNTIME"]}
        />
        <Integration
          name="Razorpay"
          icon={<PlugZap />}
          state={razorState}
          badge={connected ? "RAZORPAY TEST" : "DEMO PROVIDER"}
          description={
            connected
              ? "Razorpay Test Mode — Connected"
              : "Razorpay Test Mode not configured — Demo Provider active"
          }
          rows={[
            [
              "Connection",
              razor.status === "invalid"
                ? "Configuration blocked"
                : connected
                  ? "Connected"
                  : "Not configured",
            ],
            ["Mode", "TEST"],
            ["Provider", connected ? "Razorpay" : "PulseBack Demo Provider"],
            ["Key ID", razor.keyId ?? "Not configured"],
            [
              "Public site",
              publicSiteUrlConfigured()
                ? "Public HTTPS configured"
                : "Public HTTPS required",
            ],
            ["Webhook URL", razorpayWebhookUrl()],
            [
              "Webhook",
              razor.webhookConfigured
                ? "Secret configured · delivery unknown"
                : "Not configured",
            ],
            ["Last webhook event", razor.lastWebhookEvent ?? "None received"],
            [
              "Last webhook timestamp",
              razor.lastWebhookAt
                ? new Date(razor.lastWebhookAt).toLocaleString("en-IN")
                : "—",
            ],
            ["Orders created", String(razor.ordersCreated)],
            ["Recovery links created", String(razor.recoveryLinksCreated)],
            ["Successful Test recoveries", String(razor.successfulRecoveries)],
            ["Last Test recovery", razor.lastRecoveryAt ? new Date(razor.lastRecoveryAt).toLocaleString("en-IN") : "â€”"],
          ]}
          env={[
            "NEXT_PUBLIC_RAZORPAY_KEY_ID",
            "RAZORPAY_KEY_ID",
            "RAZORPAY_KEY_SECRET",
            "RAZORPAY_WEBHOOK_SECRET",
          ]}
        />
        <Integration
          name={ai.configuredProvider === "GROQ" ? "Groq" : "OpenAI"}
          icon={<Bot />}
          state={aiState}
          badge={
            ai.status === "connected"
              ? "CONNECTED"
              : ai.status === "degraded"
                ? "DEGRADED"
                : "FALLBACK MODE"
          }
          description={
            ai.status === "not-configured"
              ? "Deterministic Recovery Engine — zero-config fallback active"
              : `${ai.provider} structured recovery intelligence — Guardian remains authoritative`
          }
          rows={[
            ["AI Provider", ai.provider],
            ["Status", ai.status === "not-configured" ? "Fallback Mode" : ai.status === "degraded" ? "Degraded" : "Connected"],
            ["Model", ai.model ?? "Not configured"],
            ["Fallback", "Enabled"],
            ["Recent AI decisions", String(ai.recentAIDecisions)],
            ["Fallback decisions", String(ai.fallbackDecisions)],
            [
              "Last successful AI decision",
              ai.lastSuccessfulAIDecision
                ? new Date(ai.lastSuccessfulAIDecision).toLocaleString("en-IN")
                : "—",
            ],
            ["Guardian", "Active and deterministic"],
          ]}
          env={ai.requiredEnvironment}
        />
        <Integration
          name="Notifications"
          icon={<Mail />}
          state={notifications.configured ? "connected" : "demo"}
          badge={notifications.configured ? "RESEND CONNECTED" : "MOCK FALLBACK"}
          description={notifications.configured ? "Real email sending is enabled through the server-only Resend adapter." : "No external email provider is active; sends are safely simulated."}
          rows={[
            ["Provider", notifications.activeProvider === "resend" ? "Resend" : "Mock"],
            ["Configuration", notifications.configured ? "Ready" : notifications.reason ?? "Demo fallback"],
            ["Sender", notifications.from ?? "Not configured"],
            ["Test recipient", notifications.testRecipientConfigured ? "Configured server-side" : "Not configured"],
            ["Accepted sends", String(notifications.sent)],
            ["Failed sends", String(notifications.failed)],
            ["Last accepted send", notifications.lastSentAt ? new Date(notifications.lastSentAt).toLocaleString("en-IN") : "—"],
            ["SMS / WhatsApp", "Not connected"],
            ["Contact fatigue", "Guardian enforced"],
          ]}
          env={["EMAIL_PROVIDER", "RESEND_API_KEY", "EMAIL_FROM_ADDRESS", "EMAIL_FROM_NAME", "EMAIL_TEST_RECIPIENT"]}
        >
          <NotificationTestButton enabled={notifications.configured && notifications.testRecipientConfigured} />
        </Integration>
      </div>
      <section className="integration-security">
        <ShieldCheck size={21} />
        <div>
          <h3>Integration safety boundary</h3>
          <p>
            PulseBack accepts Test Mode keys only, never exposes secrets, never
            stores card data, and never lets the decision engine call provider
            APIs directly.
          </p>
        </div>
        <div>
          <span>
            <Bot size={14} />
            AI recommends
          </span>
          <i>→</i>
          <span>
            <ShieldCheck size={14} />
            Guardian authorizes
          </span>
          <i>→</i>
          <span>
            <Webhook size={14} />
            Executor acts
          </span>
        </div>
      </section>
    </AppShell>
  );
}

function Integration({
  name,
  icon,
  state,
  badge,
  description,
  rows,
  env,
  children,
}: {
  name: string;
  icon: React.ReactNode;
  state: "connected" | "demo" | "unavailable";
  badge: string;
  description: string;
  rows: string[][];
  env: string[];
  children?: React.ReactNode;
}) {
  const connected = state === "connected";
  return (
    <article className="panel integration-card">
      <div className="integration-head">
        <span>{icon}</span>
        <div>
          <h2>{name}</h2>
          <p>{description}</p>
        </div>
        <em className={state}>
          <i />
          {badge}
        </em>
      </div>
      <div className="integration-rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      {env.length > 0 && (
        <div className="env-box">
          <span>
            {connected
              ? "Configured server-side"
              : "Environment variables required"}
          </span>
          {env.map((variable) => (
            <code key={variable}>
              {connected ? <Check size={12} /> : <Copy size={12} />} {variable}
            </code>
          ))}
        </div>
      )}
      {children}
      <a className="secondary-button" href="/settings">
        Configuration guide <ExternalLink size={13} />
      </a>
    </article>
  );
}
