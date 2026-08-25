import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BrainCircuit,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  IndianRupee,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { CaseActions } from "../../../components/interactive/case-actions";
import { StatusBadge } from "../../../components/status-badge";
import { evaluateGuardian } from "../../../domain/guardian/evaluate";
import { formatCurrency } from "../../../lib/format";
import { getRecoveryRepository } from "../../../repositories/recovery-repository";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await getRecoveryRepository().getCase(id);
  if (!c) return { title: "Recovery case not found | PulseBack" };
  return {
    title: `${c.id} · ${formatCurrency(c.amountPaise / 100)} at risk | PulseBack`,
    description: `${c.failureCategory.replaceAll("_", " ")} recovery case for ${c.customerName}. Opportunity score ${c.opportunityScore}/100.`,
    openGraph: { images: [] },
    twitter: { images: [] },
  };
}
export default async function RecoveryDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repository = getRecoveryRepository();
  const [c, policies] = await Promise.all([
    repository.getCase(id),
    repository.getPolicies(),
  ]);
  if (!c) notFound();
  const currentGuardian = evaluateGuardian(c, c.decision, policies);
  const guardian =
    c.activePaymentLinkId || ["RECOVERED", "SELF_RECOVERED"].includes(c.status)
      ? {
          ...currentGuardian,
          decision: c.guardianDecision,
          reasons: c.guardianReasons,
        }
      : currentGuardian;
  const whatIf = [
    [
      "Retry immediately",
      c.failureCategory === "BANK_NETWORK" ? 28 : 36,
      "Medium",
      "Possible repeated failure",
    ],
    [
      "Wait 2 hours",
      c.failureCategory === "INSUFFICIENT_FUNDS" ? 61 : 51,
      "Low",
      "Allows issuer/customer state to change",
    ],
    [
      "New Payment Link",
      c.failureCategory === "AUTHENTICATION" ? 78 : 68,
      "Medium",
      "Fresh authentication path",
    ],
    ["Customer reminder", 63, "Medium", "Useful when intent remains high"],
    ["Stop", 0, "None", "Protects the customer relationship"],
  ];
  const recommended =
    c.decision.recommendedAction === "CREATE_PAYMENT_LINK"
      ? "New Payment Link"
      : c.decision.recommendedAction === "WAIT"
        ? "Wait 2 hours"
        : c.decision.recommendedAction === "STOP"
          ? "Stop"
          : c.decision.recommendedAction === "SEND_REMINDER"
            ? "Customer reminder"
            : c.decision.recommendedAction === "OBSERVE"
              ? "Wait 2 hours"
              : "Retry immediately";
  return (
    <AppShell active="Recovery Queue">
      <Link href="/recoveries" className="back-link">
        <ArrowLeft size={14} />
        Back to Recovery Queue
      </Link>
      <div className="case-header">
        <div>
          <div className="case-id">
            <span>{c.id}</span>
            <StatusBadge status={c.status} />
            <em>{c.provenance === "RAZORPAY_TEST" ? "RAZORPAY TEST" : "PULSEBACK DEMO"}</em>
          </div>
          <h1>
            {formatCurrency(c.amountPaise / 100)} <span>at risk</span>
          </h1>
          <p>
            <UserRound size={14} />
            {c.customerName}
            <i /> <CreditCard size={14} />
            {c.paymentMethod}
            <i />
            <Clock3 size={14} />
            Failed Aug 25, 10:02 AM
          </p>
        </div>
        <CaseActions status={c.status} caseId={c.id} />
      </div>
      {c.recoveredAmountPaise > 0 && (
        <section className="recovered-banner">
          <span>
            <Check size={22} />
          </span>
          <div>
            <p>
              {c.status === "SELF_RECOVERED"
                ? "Recovered without customer contact"
                : "Revenue recovered"}
            </p>
            <h2>{formatCurrency(c.recoveredAmountPaise / 100)} RECOVERED</h2>
            <small>
              {c.status === "SELF_RECOVERED"
                ? "Late Authorization Guard cancelled the pending action."
                : c.provenance === "RAZORPAY_TEST"
                  ? "Matched to the original failed payment through a verified Razorpay Test webhook."
                  : "Matched to the original failed payment through a simulated payment_link.paid event."}
            </small>
          </div>
          <Sparkles size={25} />
        </section>
      )}
      <div className="case-metrics">
        <article>
          <span>Opportunity score</span>
          <strong>
            {c.opportunityScore}
            <small>/ 100</small>
          </strong>
          <i>
            <b style={{ width: `${c.opportunityScore}%` }} />
          </i>
          <p>High expected recoverable value</p>
        </article>
        <article>
          <span>Recovery probability</span>
          <strong>
            {Math.round(c.predictedRecoveryProbability * 100)}
            <small>%</small>
          </strong>
          <p>Confidence {Math.round(c.decision.confidence * 100)}%</p>
        </article>
        <article>
          <span>Expected recoverable value</span>
          <strong>
            {formatCurrency(c.expectedRecoverableValuePaise / 100)}
          </strong>
          <p>Amount × adjusted probability</p>
        </article>
        <article>
          <span>Recovery memory</span>
          <strong>
            {c.memory.previousRecoveries} <small>prior wins</small>
          </strong>
          <p>Fatigue {c.memory.fatigueScore}/100</p>
        </article>
      </div>
      <div className="case-main-grid">
        <div className="case-column">
          <section className="panel detail-panel">
            <div className="detail-title">
              <span className="title-icon autopsy">
                <Activity size={18} />
              </span>
              <div>
                <h2>Payment Autopsy</h2>
                <p>Evidence-backed diagnosis of the failed transaction.</p>
              </div>
            </div>
            <div className="autopsy-section-label">Provider Evidence</div>
            <div className="autopsy-grid">
              <Data
                label="Failure family"
                value={c.failureCategory.replaceAll("_", " ")}
              />
              <Data label="Gateway status" value="FAILED" danger />
              <Data label="Payment method" value={c.paymentMethod} />
              <Data label="Recovery attempts" value={`${c.attempts} of 3`} />
              <Data
                label="Previous successes"
                value={String(c.memory.successfulPayments)}
              />
              <Data
                label="Potential late authorization"
                value={c.failureCategory === "BANK_NETWORK" ? "HIGH" : "LOW"}
                warning={c.failureCategory === "BANK_NETWORK"}
              />
            </div>
            <div className="analysis-block">
              <div>
                <span>PulseBack AI Analysis</span>
                <em
                  className={`decision-provider-badge ${c.decision.decisionProvider === "OPENAI" ? "openai" : "fallback"}`}
                >
                  {c.decision.decisionProvider === "OPENAI"
                    ? "OPENAI"
                    : "RULES FALLBACK"}
                </em>
              </div>
              <div className="explanation">
                <BrainCircuit size={16} />
                <p>{c.decision.merchantExplanation}</p>
              </div>
            </div>
          </section>
          <section className="panel detail-panel">
            <div className="detail-title">
              <span className="title-icon ai">
                <BrainCircuit size={18} />
              </span>
              <div>
                <h2>PulseBack AI Recommendation</h2>
                <p>
                  Structured diagnosis. Recommendation only — not authorization.
                </p>
              </div>
            </div>
            <div className="recommendation">
              <div>
                <span>RECOMMENDED STRATEGY</span>
                <h3>{c.decision.recommendedAction.replaceAll("_", " ")}</h3>
                <p>{c.decision.diagnosis}</p>
              </div>
              <div>
                <span>MODEL CONFIDENCE</span>
                <strong>{Math.round(c.decision.confidence * 100)}%</strong>
                {c.decision.confidence < policies.minimumConfidence && (
                  <small>Lower-confidence recommendation — merchant review advised.</small>
                )}
              </div>
            </div>
            <ul className="evidence-list">
              {c.decision.supportingEvidence.map((x) => (
                <li key={x}>
                  <Check size={13} />
                  {x}
                </li>
              ))}
            </ul>
            <div className="decision-attributes">
              <span>
                Recoverability {Math.round(c.decision.estimatedRecoveryProbability * 100)}%
              </span>
              <span>Friction {c.decision.customerFriction ?? "MEDIUM"}</span>
              <span>Urgency {c.decision.urgency ?? "MEDIUM"}</span>
              {c.decision.model && <span>Model {c.decision.model}</span>}
            </div>
            {c.operatingMode === "SHADOW" && (
              <div className="shadow-decision-note">
                <b>Shadow Decision</b>
                <span>
                  PulseBack analyzed this payment but took no external action.
                </span>
              </div>
            )}
          </section>
          <section className="panel detail-panel">
            <div className="detail-title">
              <span className="title-icon whatif">
                <IndianRupee size={18} />
              </span>
              <div>
                <h2>What If?</h2>
                <p>
                  Counterfactual estimates from the PulseBack recovery model —
                  not guaranteed outcomes.
                </p>
              </div>
            </div>
            <div className="whatif-table">
              <div>
                <span>Strategy</span>
                <span>Estimated recovery</span>
                <span>Expected value</span>
                <span>Friction</span>
              </div>
              {whatIf.map(([name, prob, friction, why]) => (
                <div
                  className={name === recommended ? "recommended" : ""}
                  key={String(name)}
                >
                  <span>
                    <b>{name}</b>
                    <small>{why}</small>
                    {name === recommended && <em>RECOMMENDED</em>}
                  </span>
                  <span>{prob}%</span>
                  <span>
                    {formatCurrency(
                      ((c.amountPaise / 100) * Number(prob)) / 100,
                    )}
                  </span>
                  <span>{friction}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="case-side">
          <section
            className={`panel guardian-panel decision-${guardian.decision.toLowerCase()}`}
          >
            <div className="guardian-head">
              <ShieldCheck size={22} />
              <div>
                <span>GUARDIAN DECISION</span>
                <h2>{guardian.decision.replace("_", " ")}</h2>
              </div>
            </div>
            <p>Deterministic financial policy evaluation</p>
            <div className="guardian-rules">
              {guardian.rules.map((r) => (
                <div key={r.label}>
                  {r.passed ? <Check size={14} /> : <X size={14} />}
                  <span>{r.label}</span>
                </div>
              ))}
            </div>
            <div className="guardian-boundary">
              <BrainCircuit size={14} />
              AI proposed <ChevronRight size={12} />
              <ShieldCheck size={14} />
              Guardian authorized
            </div>
          </section>
          <section className="panel timeline-panel">
            <div className="panel-head">
              <div>
                <h3>Recovery Timeline</h3>
                <p>Immutable-style event history</p>
              </div>
            </div>
            <div className="timeline">
              {c.timeline.map((e, i) => (
                <div className={`timeline-event ${e.kind}`} key={e.id}>
                  <span className="timeline-marker">
                    {e.kind === "success" ? (
                      <Check size={12} />
                    ) : e.kind === "danger" ? (
                      <AlertCircle size={12} />
                    ) : (
                      <i />
                    )}
                  </span>
                  <div>
                    <time>
                      {new Date(e.time).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </time>
                    <b>{e.title}</b>
                    {e.description && <p>{e.description}</p>}
                    <small>{e.actor.replace("_", " ")}</small>
                  </div>
                  {i < c.timeline.length - 1 && <em />}
                </div>
              ))}
            </div>
            <details className="raw-audit">
              <summary>
                Raw audit data <ChevronRight size={13} />
              </summary>
              <pre>
                {JSON.stringify(
                  {
                    caseId: c.id,
                    paymentId: c.paymentId,
                    status: c.status,
                    timeline: c.timeline,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
function Data({
  label,
  value,
  danger,
  warning,
}: {
  label: string;
  value: string;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div>
      <span>{label}</span>
      <b className={danger ? "danger" : warning ? "warning" : ""}>{value}</b>
    </div>
  );
}
