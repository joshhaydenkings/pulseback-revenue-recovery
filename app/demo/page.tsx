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
        eyebrow="No credentials required"
        title="PulseBack Demo Console"
        description="Run reliable, deterministic scenarios for the complete five-minute revenue recovery story."
        actions={
          <a className="secondary-button" href="/demo/events">
            <Radio size={14} /> Event simulator
          </a>
        }
      />
      <DemoConsole aiConfigured={ai.status !== "not-configured"} />
    </AppShell>
  );
}
