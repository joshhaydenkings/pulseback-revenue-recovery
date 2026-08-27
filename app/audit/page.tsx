import { ShieldCheck } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { AuditTable } from "../../components/interactive/audit-table";
import { ExportButton } from "../../components/interactive/export-button";
import { PageHeader } from "../../components/page-header";
import { getRecoveryRepository } from "../../repositories/recovery-repository";

export default async function Audit() {
  const events = await getRecoveryRepository().listAuditEvents();
  return (
    <AppShell active="Audit Trail">
      <PageHeader
        eyebrow="Traceable by design"
        title="Audit Trail"
        description="Every event, recommendation, authorization and action — readable and inspectable."
        actions={
          <ExportButton data={events} filename="pulseback-audit-events.json" />
        }
      />
      <div className="audit-trust">
        <ShieldCheck size={18} />
        <div>
          <b>Append-oriented persistent history is active</b>
          <span>Every server-side state change records a merchant-readable audit event.</span>
        </div>
        <em>{events.length} stored events</em>
      </div>
      <AuditTable events={events} />
    </AppShell>
  );
}
