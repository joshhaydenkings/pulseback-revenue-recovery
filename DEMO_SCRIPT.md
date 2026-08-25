# Five-minute Phase 4 demo script

## 0:00 — Integration status

Open `/integrations`. Show the Razorpay Test/provider state and the OpenAI provider, model, connection status, fallback counts, and last successful decision. No secrets are displayed. State clearly that no live money is involved.

## 0:40 — AI Payment Autopsy

Open `/demo`, enable **Use Live AI**, and run **Authentication Failure** for ₹4,999. Open the new case and show the separation between provider evidence, OpenAI diagnosis/recommendation/confidence, and Guardian authorization.

If no OpenAI key is available, leave the toggle off and explicitly demonstrate the deterministic `NOT_CONFIGURED` fallback instead of claiming a live AI call.

## 1:35 — Guardian remains authoritative

Run **High-Value Approval** or **Customer Fatigue Stop**. Explain that the AI only recommends; amount, contact, attempt, risk, confidence, and operating-mode rules can still require review or block execution.

## 2:15 — Safe re-analysis

Click **Re-analyze with AI** on an active case. Show a new persisted decision and audit events. Confirm the case requires the normal approval path and that re-analysis did not execute or duplicate a payment action.

## 2:55 — Recovery execution

Approve when required, run the next action, and show the one persisted Razorpay Test or simulated Payment Link. Click again to demonstrate active-link reuse. Complete the Test link only if Razorpay Test credentials are configured.

## 3:40 — Durable safety

Refresh the page and show that the case, decisions, actions, and audit remain. Replay the same webhook and show no duplicate case/action. Use **Late Authorization** or **Provider API Failure** to demonstrate safe cancellation/escalation.

## 4:25 — Deterministic benchmark

Open `/lab`, run seed `PULSEBACK-2026`, and identify it as a reproducible synthetic benchmark. Recovery Lab intentionally does not call OpenAI; only the run summary persists.

## 4:50 — Close

“PulseBack uses OpenAI for bounded payment-recovery intelligence, deterministic Guardian policy for authority, PostgreSQL for durable exact-once state, and Razorpay Test Mode for provider proof. AI cannot move money or override policy.”
