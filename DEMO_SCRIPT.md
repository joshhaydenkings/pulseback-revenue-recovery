# Five-minute PulseBack demo script

## 0:00 — Integration status

Open `/integrations`. Show the Razorpay Test/provider state and the configured AI provider, model, connection status, fallback counts, and last successful decision. No secrets are displayed. State clearly that no live money is involved.

## 0:40 — AI Payment Autopsy

Open `/demo`, enable **Use Live AI**, and run **Authentication Failure** for ₹4,999. Open the new case and show the separation between provider evidence, Groq diagnosis/recommendation/confidence, and Guardian authorization.

If no Groq key is available, leave the toggle off and explicitly demonstrate the deterministic `NOT_CONFIGURED` fallback instead of claiming a live AI call.

## 1:35 — Guardian remains authoritative

Run **High-Value Approval** or **Customer Fatigue Stop**. Explain that the AI only recommends; amount, contact, attempt, risk, confidence, and operating-mode rules can still require review or block execution.

## 2:15 — Safe re-analysis

Click **Re-analyze with AI** on an active case. Show a new persisted decision and audit events. Confirm the case requires the normal approval path and that re-analysis did not execute or duplicate a payment action.

## 2:55 — Recovery execution

Approve when required, run the next action, and show the one persisted Razorpay Test or simulated Payment Link. Click again to demonstrate active-link reuse. Complete the Test link only if Razorpay Test credentials are configured.

## 3:40 — Durable safety

Refresh the page and show that the case, decisions, actions, and audit remain. Replay the same webhook and show no duplicate case/action. Use **Late Authorization** or **Provider API Failure** to demonstrate safe cancellation/escalation.

## 4:25 — Deterministic benchmark

Open `/lab`, run seed `PULSEBACK-2026`, and identify it as a reproducible synthetic benchmark. Recovery Lab intentionally does not call hosted AI; only the run summary persists.

For an edge-case proof, double-click approval or Run Next Action: one request claims the mutation and the other receives a safe conflict. A stale expiry/cancellation event cannot move a recovered or stopped case back into recovery.

## Pre-demo recovery plan

- If managed PostgreSQL is unavailable, do not claim persistence; switch to the clearly labeled demo fallback and state that it resets on restart.
- If Groq is unavailable, show the explicit deterministic fallback reason and continue the same Guardian path.
- If Razorpay Test or the public webhook is unavailable, use the internal simulator and label the Payment Link as simulated.
- If Resend is unavailable, preview the controlled template and show the mock-provider audit entry; do not claim delivery.
- To restore local seeded data, stop the app and run `npm run db:reset`. This command refuses non-local databases.

## Optional Phase 6 email proof

1. Open `/integrations` and show **Resend Connected** or honestly show **Mock Fallback**.
2. Use **Send fixed test email** only when the server-side test recipient is configured.
3. Open a non-terminal case that already has a Razorpay Test Payment Link.
4. Preview **Customer Communication** and point out the masked recipient, exact amount, and persisted link.
5. Send once and show `RECOVERY_EMAIL_SENT` plus the provider message ID in the audit trail.
6. Send again and show `DUPLICATE_RECOVERY_EMAIL_IGNORED` with no second provider send.
7. Never describe provider acceptance as inbox delivery.

## 4:50 — Close

“PulseBack uses Groq for bounded payment-recovery intelligence, deterministic Guardian policy for authority, PostgreSQL for durable exact-once state, and Razorpay Test Mode for provider proof. AI cannot move money or override policy.”
