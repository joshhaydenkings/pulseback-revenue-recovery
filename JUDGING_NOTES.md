# Track 03 Judging Notes

| Track requirement | PulseBack implementation |
| --- | --- |
| Detect revenue at risk | Signed Razorpay webhook gateway plus shared internal event simulator |
| Determine intervention | Payment Autopsy, structured AI decision and deterministic fallback heuristics |
| Execute bounded workflow | Typed state machine, Guardian authorization and provider adapters |
| Measure money recovered | Test Mode recovery cases and deterministic Recovery Lab |
| Compliant escalation | High-value, low-confidence, risky and repeated-failure approval paths |
| Stopping rules | Attempts, 24h/7d contacts, fatigue, risk and duplicate-link policies |
| Audit trail | Human-readable actor/event/outcome history with expandable metadata |
| Failure handling | Provider failure scenario escalates without duplicate customer action |

## Five points to emphasize

1. Opportunity ranking uses expected recoverable value, not recency.
2. The Late Authorization Guard intentionally does nothing before doing something.
3. Customer recovery memory prevents transaction-by-transaction tunnel vision.
4. AI and financial authorization are separate architectural roles.
5. Recovery Lab compares strategies on identical seeded cases and labels every metric synthetic.
