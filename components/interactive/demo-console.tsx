"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CopyCheck,
  Flame,
  Link2,
  Loader2,
  Play,
  ShieldAlert,
  Sparkles,
  TerminalSquare,
} from "lucide-react";

const scenarios = [
  ["authentication", "Authentication Failure", "A recoverable ₹4,999 card payment", CircleDollarSign],
  ["insufficient", "Insufficient Funds", "Wait without aggressive retry", Clock3],
  ["late_authorization", "Late Authorization", "Observe, cancel, self-recover", Sparkles],
  ["high_value", "High-Value Approval", "Guardian holds a ₹42,000 action", ShieldAlert],
  ["fatigue", "Customer Fatigue Stop", "Stop after contact threshold", AlertTriangle],
  ["payment_link", "Payment Link Recovery", "Create once and mark recovered", Link2],
  ["provider_failure", "Provider API Failure", "Fail safely without duplicate", Flame],
  ["duplicate_webhook", "Duplicate Webhook", "Ignore using event idempotency", CopyCheck],
] as const;

const aiScenarios = [
  ["authentication_failure", "Authentication Failure"],
  ["insufficient_funds", "Insufficient Funds"],
  ["bank_timeout", "Bank Timeout"],
  ["high_value_failure", "High Value"],
  ["exhausted_contact_limit", "Customer Fatigue"],
  ["repeated_failure", "Repeated Failure"],
] as const;

type AITestResult = {
  provider: "OPENAI" | "DETERMINISTIC";
  model?: string;
  fallbackReason?: string;
  contextSummary: Record<string, string | number>;
  decision: {
    diagnosis: string;
    recommendedAction: string;
    confidence: number;
    estimatedRecoveryProbability: number;
  };
  guardian: { decision: string; reasons: string[] };
};

export function DemoConsole({ aiConfigured }: { aiConfigured: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState("");
  const [useLiveAI, setUseLiveAI] = useState(false);
  const [result, setResult] = useState<{
    message: string;
    caseId: string;
    scenario: string;
    error?: string;
  } | null>(null);
  const [aiScenario, setAIScenario] = useState("authentication_failure");
  const [aiResult, setAIResult] = useState<AITestResult>();
  const [aiError, setAIError] = useState("");

  const run = async (scenario: string) => {
    setRunning(scenario);
    const response = await fetch("/api/demo/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario, useLiveAI }),
    });
    setResult(await response.json());
    setRunning("");
    router.refresh();
  };

  const analyze = async () => {
    setRunning("ai_test");
    setAIError("");
    setAIResult(undefined);
    try {
      const response = await fetch("/api/demo/ai-decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: aiScenario }),
      });
      const value = (await response.json()) as AITestResult & { error?: string };
      if (!response.ok) throw new Error(value.error ?? "AI analysis failed");
      setAIResult(value);
    } catch (error) {
      setAIError(error instanceof Error ? error.message : "AI analysis failed");
    } finally {
      setRunning("");
    }
  };

  return (
    <>
      <section className="demo-hero">
        <div>
          <span>
            <TerminalSquare size={14} /> JUDGE-FRIENDLY DEMO MODE
          </span>
          <h2>One click. Full recovery story.</h2>
          <p>
            Every scenario enters the same persistent state machine, Guardian
            policy and append-only audit pipeline used by provider events.
          </p>
          <label className="live-ai-toggle">
            <input
              type="checkbox"
              checked={useLiveAI}
              disabled={!aiConfigured}
              onChange={(event) => setUseLiveAI(event.target.checked)}
            />
            Use Live AI Analysis
            <small>{aiConfigured ? "Explicit model calls enabled for scenarios" : "Configure OPENAI_API_KEY to enable"}</small>
          </label>
        </div>
        <button
          className="primary-button full-demo"
          onClick={() => run("full_demo")}
          disabled={Boolean(running)}
        >
          {running === "full_demo" ? (
            <Loader2 className="spin" size={17} />
          ) : (
            <Play size={17} />
          )}
          Run full scripted demo
        </button>
      </section>
      {result && (
        <div className={`demo-result ${result.scenario === "provider_failure" ? "failure" : ""}`}>
          <CheckCircle2 size={18} />
          <div>
            <b>{result.scenario === "provider_failure" ? "Failure handled safely" : "Scenario completed"}</b>
            <span>{result.message}</span>
          </div>
          <a href={`/recoveries/${result.caseId}`}>
            View {result.caseId} <ArrowRight size={14} />
          </a>
        </div>
      )}
      <div className="scenario-grid">
        {scenarios.map(([id, title, description, Icon], index) => (
          <button
            className="scenario-card"
            key={id}
            onClick={() => run(id)}
            disabled={Boolean(running)}
          >
            <span className="scenario-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="scenario-icon"><Icon size={19} /></span>
            <b>{title}</b>
            <small>{description}</small>
            <em>{running === id ? <Loader2 className="spin" size={14} /> : <ArrowRight size={14} />}</em>
          </button>
        ))}
      </div>
      <section className="panel ai-decision-test">
        <div>
          <span><BrainCircuit size={16} /> DEVELOPMENT / DEMO TOOL</span>
          <h3>AI Decision Test</h3>
          <p>Analyze a safe context summary without exposing the raw prompt or hidden reasoning.</p>
        </div>
        <div className="ai-test-controls">
          <select value={aiScenario} onChange={(event) => setAIScenario(event.target.value)}>
            {aiScenarios.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="secondary-button" disabled={Boolean(running)} onClick={analyze}>
            {running === "ai_test" ? <Loader2 className="spin" size={14} /> : <BrainCircuit size={14} />}
            Analyze With PulseBack AI
          </button>
        </div>
        {aiError && <div className="demo-result failure">{aiError}</div>}
        {aiResult && (
          <div className="ai-test-result">
            <div><span>Provider</span><b>{aiResult.provider === "OPENAI" ? `OPENAI · ${aiResult.model}` : `RULES FALLBACK${aiResult.fallbackReason ? ` · ${aiResult.fallbackReason}` : ""}`}</b></div>
            <div><span>Context summary</span><b>{Object.entries(aiResult.contextSummary).map(([key, value]) => `${key}: ${value}`).join(" · ")}</b></div>
            <div><span>Diagnosis</span><b>{aiResult.decision.diagnosis}</b></div>
            <div><span>Recommendation</span><b>{aiResult.decision.recommendedAction.replaceAll("_", " ")}</b></div>
            <div><span>Confidence / recoverability</span><b>{Math.round(aiResult.decision.confidence * 100)}% / {Math.round(aiResult.decision.estimatedRecoveryProbability * 100)}%</b></div>
            <div><span>Guardian outcome</span><b>{aiResult.guardian.decision.replaceAll("_", " ")}</b></div>
          </div>
        )}
      </section>
      <div className="script-sequence">
        <h3>Full scripted sequence</h3>
        <p>The reliable five-minute product narrative.</p>
        <div>
          {[
            ["₹4,999 fails", "Detected"],
            ["AI autopsy", "Structured"],
            ["Guardian", "Authoritative"],
            ["Payment Link", "Created once"],
            ["Customer pays", "₹4,999 recovered"],
            ["₹42,000 fails", "Approval held"],
            ["Provider fails", "Escalated safely"],
          ].map(([label, value], index) => (
            <span key={label}>
              <i>{index + 1}</i><b>{label}</b><small>{value}</small>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
