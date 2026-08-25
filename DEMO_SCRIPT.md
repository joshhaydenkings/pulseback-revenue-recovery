# Five-minute Demo Script

## 0:00 — The problem

“A failed payment is revenue with existing customer intent. Most systems either retry blindly or stop too early. PulseBack adds diagnosis, memory, policy and measurable recovery.”

## 0:30 — Overview

Open `/`. Point to ₹54,299 recovered, active opportunities ranked by expected recoverable value, live Guardian activity, simulated-data label and Autopilot mode.

## 1:00 — The hero recovery

Open `/demo`, run **Payment Link Recovery**, then open `RC-1039`. Show the ₹4,999 amount, 87/100 opportunity score and Payment Autopsy.

## 1:30 — AI vs authority

In the case, show the structured AI recommendation and evidence. Then show the separate Guardian card: AI recommends; Guardian authorizes. Open **What If?** to explain why a fresh Payment Link beats an immediate retry.

## 2:20 — Recovery outcome

Use `RC-1012` to show the strong “₹9,999 RECOVERED” outcome and full event timeline. Explain that `payment_link.paid` is matched back to the original case.

## 2:50 — Late Authorization Guard

Open `RC-1042` or run **Late Authorization**. Explain: failed → observing → authorized late → pending recovery cancelled → self-recovered with no customer contact.

## 3:25 — High-value safety

Run **High-Value Approval** and open `RC-1048`. The AI recommends recovery, but Guardian requires merchant approval because ₹42,000 exceeds the ₹25,000 autonomous threshold.

## 3:55 — Graceful failure

Run **Provider API Failure** and open `RC-1029`. Show that link creation failed once, no duplicate action was created and the case escalated with a readable audit message.

## 4:20 — Measurable batch evaluation

Open `/lab`. Run seed `PULSEBACK-2026` over 200 cases. Point to incremental synthetic recovery, lift vs baseline, zero PulseBack guardrail violations, category comparison and the funnel. Clearly say “synthetic benchmark, not a production claim.”

## 4:55 — Close

“PulseBack treats autonomous fintech AI as a controlled system: state, recovery economics, memory, idempotency, human approval, stopping rules and an audit trail — not just an LLM call.”
