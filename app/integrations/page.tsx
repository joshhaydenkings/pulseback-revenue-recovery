import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Mail,
  PlugZap,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { PageHeader } from "../../components/page-header";
import { getRazorpayIntegrationStatus } from "../../services/razorpay-integration-service";

export default async function Integrations() {
  const razor = await getRazorpayIntegrationStatus();
  const connected = razor.status === "connected";
  return (
    <AppShell active="Integrations">
      <PageHeader
        eyebrow="Server-side credentials only"
        title="Integrations"
        description="Connect recovery providers while keeping financial secrets outside client-side JavaScript."
      />
      <div className="integration-grid">
        <Integration
          name="Razorpay"
          icon={<PlugZap />}
          connected={connected}
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
          ]}
          env={[
            "NEXT_PUBLIC_RAZORPAY_KEY_ID",
            "RAZORPAY_KEY_ID",
            "RAZORPAY_KEY_SECRET",
            "RAZORPAY_WEBHOOK_SECRET",
          ]}
        />
        <Integration
          name="OpenAI"
          icon={<Bot />}
          connected={false}
          badge="PHASE 4"
          description="OpenAI remains intentionally disconnected in Phase 3."
          rows={[
            ["Decision engine", "Deterministic rules"],
            ["External model calls", "Disabled"],
            ["Guardian", "Active and server-driven"],
          ]}
          env={[]}
        />
        <Integration
          name="Notifications"
          icon={<Mail />}
          connected
          badge="SIMULATED"
          description="Customer recovery contact adapters. No messages leave demo mode."
          rows={[
            ["Email", "Simulated delivery"],
            ["SMS", "Simulated delivery"],
            ["Contact fatigue", "Guardian enforced"],
          ]}
          env={[]}
        />
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
            Rules recommend
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
  connected,
  badge,
  description,
  rows,
  env,
}: {
  name: string;
  icon: React.ReactNode;
  connected: boolean;
  badge: string;
  description: string;
  rows: string[][];
  env: string[];
}) {
  return (
    <article className="panel integration-card">
      <div className="integration-head">
        <span>{icon}</span>
        <div>
          <h2>{name}</h2>
          <p>{description}</p>
        </div>
        <em className={connected ? "connected" : ""}>
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
      <a className="secondary-button" href="/settings">
        Configuration guide <ExternalLink size={13} />
      </a>
    </article>
  );
}
