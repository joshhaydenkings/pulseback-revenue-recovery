"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Save, ShieldCheck } from "lucide-react";
import type { GuardianPolicies } from "../../domain/recovery/types";
import { formatCurrency } from "../../lib/format";

export function PolicyForm({ initialPolicies }: { initialPolicies: GuardianPolicies }) {
  const router = useRouter();
  const [policies, setPolicies] = useState(initialPolicies);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setPending(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch("/api/policies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(policies),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to save policies");
      setSaved(true);
      router.refresh();
      window.setTimeout(() => setSaved(false), 2400);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save policies");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="policies-layout">
      <section className="panel policy-form">
        <div className="policy-section">
          <h3>Control mode</h3><p>Choose how much authority PulseBack receives.</p>
          <div className="mode-options">
            {(["SHADOW", "APPROVAL", "AUTOPILOT"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                disabled={pending}
                aria-pressed={policies.operatingMode === mode}
                className={policies.operatingMode === mode ? "selected" : ""}
                onClick={() => {
                  if (mode === "AUTOPILOT" && policies.operatingMode !== "AUTOPILOT" && !window.confirm("Enable bounded autonomous recovery? Guardian limits will still apply.")) return;
                  setPolicies({ ...policies, operatingMode: mode });
                }}
              >
                <span>{mode}</span>
                <small>{mode === "SHADOW" ? "Recommendations only" : mode === "APPROVAL" ? "Merchant confirms actions" : "Bounded autonomous recovery"}</small>
                {policies.operatingMode === mode && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
        <div className="policy-section">
          <h3>Financial authority</h3><p>Guardian always makes the final authorization decision.</p>
          <PolicyNumber label="Autonomous recovery maximum" value={policies.autonomousAmountThresholdPaise / 100} suffix="INR" onChange={(value) => setPolicies({ ...policies, autonomousAmountThresholdPaise: Math.round(value * 100) })} />
          <PolicyNumber label="New customer approval threshold" value={policies.newCustomerApprovalThresholdPaise / 100} suffix="INR" onChange={(value) => setPolicies({ ...policies, newCustomerApprovalThresholdPaise: Math.round(value * 100) })} />
          <PolicyNumber label="Minimum AI confidence" value={policies.minimumConfidence * 100} suffix="%" onChange={(value) => setPolicies({ ...policies, minimumConfidence: value / 100 })} />
        </div>
        <div className="policy-section">
          <h3>Attempts & customer contact</h3>
          <PolicyNumber label="Observation window" value={policies.observationWindowMinutes} suffix="minutes" onChange={(value) => setPolicies({ ...policies, observationWindowMinutes: Math.round(value) })} />
          <PolicyNumber label="Maximum attempts per case" value={policies.maxAttemptsPerCase} suffix="attempts" onChange={(value) => setPolicies({ ...policies, maxAttemptsPerCase: Math.round(value) })} />
          <PolicyNumber label="Contacts per 24 hours" value={policies.contactsPer24h} suffix="contacts" onChange={(value) => setPolicies({ ...policies, contactsPer24h: Math.round(value) })} />
          <PolicyNumber label="Contacts per 7 days" value={policies.contactsPer7d} suffix="contacts" onChange={(value) => setPolicies({ ...policies, contactsPer7d: Math.round(value) })} />
          <PolicyNumber label="Fatigue stop threshold" value={policies.fatigueStopThreshold} suffix="of 100" onChange={(value) => setPolicies({ ...policies, fatigueStopThreshold: value })} />
        </div>
        <div className="policy-section switches">
          <Switch label="Stop automatically on high-risk flags" checked={policies.highRiskAutoStop} onChange={(value) => setPolicies({ ...policies, highRiskAutoStop: value })} />
          <Switch label="Prevent repeated identical actions" checked={policies.preventRepeatedAction} onChange={(value) => setPolicies({ ...policies, preventRepeatedAction: value })} />
        </div>
        <button className="primary-button save-policy" type="button" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="spin" size={14} /> : <Save size={14} />}
          {pending ? "Saving…" : saved ? "Policies saved" : "Save policies"}
        </button>
        {error && <div className="action-toast action-error" role="alert">{error}</div>}
      </section>
      <aside>
        <div className="policy-summary">
          <ShieldCheck size={25} /><span>Live policy summary</span>
          <p>PulseBack may autonomously recover transactions up to <b>{formatCurrency(policies.autonomousAmountThresholdPaise / 100)}</b> when confidence is above <b>{Math.round(policies.minimumConfidence * 100)}%</b>, contact limits have not been reached, and no risk flags are present.</p>
          <small>Changes are persisted by the active server data provider.</small>
        </div>
        <div className="policy-principle"><b>AI recommends.</b><b>Guardian authorizes.</b><b>Executor acts.</b></div>
      </aside>
    </div>
  );
}

function PolicyNumber({ label, value, suffix, onChange }: { label: string; value: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="policy-row"><span>{label}</span><div><input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /><small>{suffix}</small></div></label>;
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="switch-row"><span>{label}</span><button type="button" role="switch" aria-checked={checked} aria-label={label} className={checked ? "on" : ""} onClick={() => onChange(!checked)}><i /></button></label>;
}
