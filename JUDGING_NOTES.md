# Track 03 judging notes

| Requirement | Phase 4 evidence |
| --- | --- |
| Detect revenue at risk | Signed Razorpay Test failure webhook and shared simulator pipeline |
| Diagnose failure | Groq structured Payment Autopsy with provider/model metadata |
| Choose a strategy | Bounded enum action, confidence, probability, evidence, friction, urgency |
| Preserve safety | Guardian independently blocks/requires approval; AI cannot execute |
| Resist prompt injection | Provider text is treated as untrusted data, sanitized, and risk-flagged |
| Survive AI failure | Explicit deterministic fallback reason is persisted and visible |
| Execute recovery | Guardian-authorized Razorpay Test or clearly labeled mock Payment Link |
| Prevent duplicates | Database webhook uniqueness, atomic action claim, active-link reuse |
| Provide auditability | Append-only AI request/result/fallback, Guardian, action, and provider events |
| Re-evaluate safely | New decision and pending plan; no automatic financial action |
| Work without credentials | Deterministic AI fallback, mock provider, and demo repository fallback |
| Resist concurrent clicks | Optimistic case claims and conditional action claims allow one winner |
| Preserve terminal outcomes | Stale paid/expired/cancelled/provider-failure events cannot regress terminal cases |
| Degrade safely | Loading, empty, inline mutation-error, and server retry states remain explicit |

## Claims to make precisely

- Groq is genuine only when `GROQ_API_KEY` is configured and selected; otherwise the UI says rules fallback. OpenAI remains an optional alternative.
- AI diagnoses and recommends. Guardian and the state machine authorize; provider adapters execute.
- Razorpay calls are genuine only in Test Mode with complete Test credentials.
- Live Razorpay keys and real money are prohibited by this build.
- Automated provider tests use injected fake responses and spend no credits.
- Email is genuine only when the UI shows **Resend Connected** and a controlled manual test has been received; otherwise it is simulated. SMS remains unconnected.
- Recovery Lab is deterministic synthetic evidence, not a production performance claim and not an AI call.

## Strongest proof

1. Compare provider evidence, AI recommendation, and Guardian result on one case.
2. Trigger a risk/contact-limit case and show Guardian overriding an otherwise actionable strategy.
3. Re-analyze and prove no action executed automatically.
4. Remove the selected provider key and show an explicit persisted fallback without breaking the pipeline.
5. Restart the app and replay a provider event; state and duplicate protection remain durable.
6. Preview a recovery email, send it once, then prove a repeated click is suppressed by database idempotency.

The recovery-email endpoint is not an open relay: the browser supplies only a case ID. Recipient, content, amount, and CTA are reloaded from trusted server state. Do not claim inbox delivery from a Resend API acceptance.

## Known limitations to disclose

- No authentication, merchant onboarding, or tenant isolation; this remains a controlled hackathon deployment.
- No Razorpay Live Mode and no real-money claim. All genuine Razorpay traffic is Test Mode.
- Resend acceptance is not the same as inbox delivery; delivery webhooks are not yet modeled.
- CSP is deferred until a nonce-based policy is tested end to end with Razorpay Checkout.
- Recovery Lab and the Leak Map are synthetic, reproducible product evidence rather than production performance measurements.
