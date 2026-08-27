import { Clock3, Database, Gauge, Zap } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { DueActionControl } from "../../components/interactive/due-action-control";
import { PageHeader } from "../../components/page-header";
import { getRecoveryRepository } from "../../repositories/recovery-repository";

export default function Settings() {
  const repository = getRecoveryRepository();
  return (
    <AppShell active="Settings">
      <PageHeader eyebrow="Demo environment" title="Settings" description="Runtime controls for local evaluation and accelerated recovery timers." />
      <div className="settings-grid">
        <section className="panel settings-card">
          <span><Zap size={18} /></span>
          <div><h3>Accelerated demo timers</h3><p>Use Process now to execute actions whose persisted schedule is already due.</p></div>
          <em>ENABLED</em>
        </section>
        <section className="panel settings-card">
          <span><Clock3 size={18} /></span>
          <div><h3>Process due actions</h3><p>Run scheduled recovery actions without waiting for cron.</p></div>
          <DueActionControl />
        </section>
        <section className="panel settings-card">
          <span><Database size={18} /></span>
          <div><h3>Data adapter</h3><p>{repository.kind === "postgresql" ? "PostgreSQL is the authoritative recovery store." : "Zero-config in-memory fallback. Configure DATABASE_URL for persistent PostgreSQL."}</p></div>
          <em>{repository.kind === "postgresql" ? "POSTGRESQL" : "DEMO STORE"}</em>
        </section>
        <section className="panel settings-card">
          <span><Gauge size={18} /></span>
          <div><h3>Currency & locale</h3><p>Indian Rupee · en-IN · Asia/Calcutta</p></div>
          <em>INR</em>
        </section>
      </div>
    </AppShell>
  );
}
