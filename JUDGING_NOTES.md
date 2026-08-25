# Track 03 judging notes

| Requirement | Phase 4 evidence |
| --- | --- |
| Detect revenue at risk | Signed Razorpay Test failure webhook and shared simulator pipeline |
| Diagnose failure | OpenAI structured Payment Autopsy with provider/model metadata |
| Choose a strategy | Bounded enum action, confidence, probability, evidence, friction, urgency |
| Preserve safety | Guardian independently blocks/requires approval; AI cannot execute |
| Resist prompt injection | Provider text is treated as untrusted data, sanitized, and risk-flagged |
| Survive AI failure | Explicit deterministic fallback reason is persisted and visible |
| Execute recovery | Guardian-authorized Razorpay Test or clearly labeled mock Payment Link |
| Prevent duplicates | Database webhook uniqueness, atomic action claim, active-link reuse |
| Provide auditability | Append-only AI request/result/fallback, Guardian, action, and provider events |
| Re-evaluate safely | New decision and pending plan; no automatic financial action |
| Work without credentials | Deterministic AI fallback, mock provider, and demo repository fallback |

## Claims to make precisely

- OpenAI is genuine only when `OPENAI_API_KEY` is configured; otherwise the UI says rules fallback.
- AI diagnoses and recommends. Guardian and the state machine authorize; provider adapters execute.
- Razorpay calls are genuine only in Test Mode with complete Test credentials.
- Live Razorpay keys and real money are prohibited by this build.
- Automated OpenAI tests use injected fake responses and spend no credits.
- Email and SMS remain simulated.
- Recovery Lab is deterministic synthetic evidence, not a production performance claim and not an AI call.

## Strongest proof

1. Compare provider evidence, AI recommendation, and Guardian result on one case.
2. Trigger a risk/contact-limit case and show Guardian overriding an otherwise actionable strategy.
3. Re-analyze and prove no action executed automatically.
4. Remove the OpenAI key and show an explicit persisted fallback without breaking the pipeline.
5. Restart the app and replay a provider event; state and duplicate protection remain durable.
