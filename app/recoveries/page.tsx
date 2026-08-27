import { Plus } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { ExportButton } from "../../components/interactive/export-button";
import { RecoveryTable } from "../../components/interactive/recovery-table";
import { PageHeader } from "../../components/page-header";
import { formatCurrency } from "../../lib/format";
import { getRecoveryRepository } from "../../repositories/recovery-repository";

export default async function Recoveries() {
  const repository = getRecoveryRepository();
  const cases = await repository.listCases();
  const dashboard = await repository.getDashboard(cases);
  return (
    <AppShell active="Recovery Queue">
      <PageHeader
        eyebrow="Expected value prioritized"
        title="Recovery Queue"
        description="Every failed payment ranked by recoverability, value and customer safety."
        actions={
          <>
            <ExportButton
              data={cases}
              filename="pulseback-recovery-cases.json"
              label="Export"
            />
            <a className="primary-button" href="/demo/events">
              <Plus size={14} /> Simulate failure
            </a>
          </>
        }
      />
      <div className="queue-summary">
        <span><b>{formatCurrency(dashboard.revenueAtRiskPaise / 100)}</b>Total at risk</span>
        <span><b>{dashboard.activeRecoveries}</b>Active recoveries</span>
        <span><b>{dashboard.needsApproval}</b>Need approval</span>
        <span><b>{formatCurrency(dashboard.expectedRecoveryPaise / 100)}</b>Expected recovery</span>
      </div>
      <RecoveryTable cases={cases} />
    </AppShell>
  );
}
