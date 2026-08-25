# Track 03 judging notes

| Requirement              | Phase 3 evidence                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Detect revenue at risk   | Authenticated Razorpay Test `payment.failed` webhook and shared simulator pipeline |
| Diagnose failure         | Provider failure fields plus deterministic Payment Autopsy                         |
| Execute recovery         | Guardian-authorized server-side Razorpay Test Payment Link                         |
| Measure outcome          | Exact-link, exact-reference, exact-amount `payment_link.paid` association          |
| Prevent duplicates       | Database webhook uniqueness, atomic action claim, and active-link reuse            |
| Preserve safety          | Live keys blocked; Checkout signature verified; raw webhook HMAC required          |
| Handle ambiguity         | Late Authorization Guard cancels recovery before contact                           |
| Handle provider failure  | Persisted error and escalation without duplicate link creation                     |
| Provide auditability     | Append-oriented provider, system, Guardian, merchant, and customer events          |
| Work without credentials | Explicit Demo Provider and deterministic repository fallback                       |

## Claims to make precisely

- Razorpay Order and Payment Link API calls are genuine only when Test credentials are configured.
- Signed Razorpay webhooks are authoritative; Checkout callback verification does not recover money.
- Recovery is counted only after a matching signed paid event.
- OpenAI is disconnected in Phase 3; diagnosis is deterministic.
- Email and SMS remain simulated.
- Recovery Lab is synthetic and reproducible, not a production performance claim.
- No live Razorpay key or real money is accepted by this build.

## Strongest technical proof

1. Close Checkout after a failure; the webhook still creates the case.
2. Restart the app; the case and duplicate event protection remain.
3. Double-click link execution; one stored action/link is returned.
4. Send a mismatched paid amount/reference; no recovery is counted.
5. Send the exact paid event twice; recovered revenue changes only once.
