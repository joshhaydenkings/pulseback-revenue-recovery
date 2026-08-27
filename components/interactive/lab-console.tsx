"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Play, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { runEvaluation, type EvaluationResult } from "../../domain/evaluation/simulator";
import { formatCurrency } from "../../lib/format";
import { CategoryComparison, RecoveryComparison, RecoveryFunnel } from "../charts/lab-charts";

export function LabConsole() {
  const [seed, setSeed] = useState("PULSEBACK-2026");
  const [count, setCount] = useState(200);
  const [result, setResult] = useState(() => runEvaluation(seed, count));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed, caseCount: count }),
      });
      const body = (await response.json()) as EvaluationResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Evaluation could not be completed");
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evaluation could not be completed");
    } finally {
      setPending(false);
    }
  };

  return <>
    <div className="lab-controls panel">
      <label>Evaluation seed<input value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
      <label>Case count<select value={count} onChange={(event) => setCount(Number(event.target.value))}>{[50, 100, 200, 500].map((value) => <option key={value}>{value}</option>)}</select></label>
      <button className="primary-button" onClick={run} disabled={pending || !seed.trim()}>{pending ? <Loader2 className="spin" size={14} /> : <Play size={14} />}{pending ? "Running model…" : "Run evaluation"}</button>
      <button className="secondary-button" aria-label="Reset deterministic benchmark" disabled={pending} onClick={() => { setSeed("PULSEBACK-2026"); setCount(200); setResult(runEvaluation()); setError(""); }}><RotateCcw size={14} /></button>
    </div>
    {error && <div className="synthetic-callout" role="alert"><AlertTriangle size={15} /><span><b>Evaluation unavailable.</b> {error}</span></div>}
    <div className="synthetic-callout"><Sparkles size={15} /><span><b>Synthetic benchmark results.</b> Both strategies run against the same deterministic cases and outcome draws. These are not production claims.</span></div>
    <section className="increment-card"><span>Incremental synthetic revenue recovered vs baseline</span><h2>+{formatCurrency(result.incrementalPaise / 100)}</h2><p><b>+{(result.lift * 100).toFixed(1)}% recovery lift</b> · seed {result.seed} · {result.caseCount} identical cases</p></section>
    <div className="comparison-cards"><ResultCard title="Baseline" result={result.baseline} risk={result.revenueAtRiskPaise} /><ResultCard title="PulseBack" result={result.pulseBack} risk={result.revenueAtRiskPaise} pulse /></div>
    <div className="lab-grid"><section className="panel chart-panel"><div className="panel-head"><div><h3>Recovered revenue</h3><p>Same dataset, different recovery strategy</p></div></div><RecoveryComparison baseline={result.baseline.recoveredPaise / 100} pulseBack={result.pulseBack.recoveredPaise / 100} /></section><section className="panel chart-panel"><div className="panel-head"><div><h3>PulseBack funnel</h3><p>Cases pursued with stopping rules applied</p></div></div><RecoveryFunnel data={result.funnel} /></section></div>
    <section className="panel chart-panel category-chart"><div className="panel-head"><div><h3>Recovery by failure category</h3><p>Recovered INR by diagnosis family</p></div><span className="chart-legend"><i /> PulseBack <i /> Baseline</span></div><CategoryComparison data={result.byCategory} /></section>
    <div className="guardrail-strip"><ShieldCheck size={18} /><div><b>Guardian violations: {result.pulseBack.guardrailViolations}</b><span>{result.pulseBack.stopped} cases stopped · {result.pulseBack.escalations} escalated · {result.pulseBack.selfRecovered} self-recovered without contact</span></div></div>
  </>;
}

function ResultCard({ title, result, risk, pulse = false }: { title: string; result: EvaluationResult["baseline"]; risk: number; pulse?: boolean }) {
  return <article className={`result-card ${pulse ? "pulse" : ""}`}><div className="result-title"><span>{title}</span>{pulse && <em>GUARDIAN PROTECTED</em>}</div><h3>{formatCurrency(result.recoveredPaise / 100)}</h3><p>of {formatCurrency(risk / 100)} at risk</p><div className="result-stats"><span><b>{risk ? (result.recoveredPaise / risk * 100).toFixed(1) : "0.0"}%</b>Recovery rate</span><span><b>{result.actions}</b>Actions</span><span><b>{result.contacts}</b>Contacts</span><span><b>{result.guardrailViolations}</b>Violations</span></div></article>;
}
