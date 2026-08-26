import { Radio } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { DemoConsole } from "../../components/interactive/demo-console";
import { PageHeader } from "../../components/page-header";
import { getAIIntegrationStatus } from "../../services/ai-integration-service";

export default async function Demo() {
  const ai = await getAIIntegrationStatus();
  return (
    <AppShell active="Demo Console">
      <PageHeader
        eyebrow="DEMO / TEST ENVIRONMENT"
        title="PulseBack Demo Console"
        description="Run controlled synthetic scenarios for the complete five-minute recovery story. Razorpay remains Test Mode only."
        actions={
          <a className="secondary-button" href="/demo/events">
            <Radio size={14} /> Event simulator
          </a>
        }
      />
      <DemoConsole
        aiConfigured={ai.status !== "not-configured"}
        aiProvider={ai.configuredProvider}
      />
    </AppShell>
  );
}
