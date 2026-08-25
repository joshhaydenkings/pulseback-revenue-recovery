# Five-minute Phase 3 demo script

## 0:00 — Safety status

Open `/integrations`. Show **Razorpay Test Mode — Connected**, masked key, webhook status, persistent counts, and **OpenAI disconnected — deterministic engine active**. Say: “This is Test Mode; no real money is involved.”

If credentials are intentionally absent, show **Demo Provider active** and use the fallback flow below without claiming real Razorpay calls.

## 0:40 — Real Test Order and signed failure

Open `/demo/checkout`, choose ₹4,999, and start Razorpay Test Checkout. Explain that the Order was created server-side and persisted; only Razorpay collects card data. Trigger a Test payment failure.

Wait for the signed webhook to create a case. The browser polls only to surface the result—the webhook processing is independent of this page.

## 1:30 — Persistent recovery case

Open the new case. Point to the **RAZORPAY TEST** provenance, real provider failure reason, order/payment association, deterministic diagnosis, Guardian decision, and audit timeline. Refresh to demonstrate persistence.

## 2:10 — Genuine Test Payment Link

Approve if required and click **Run Next Action**. Open the stored Razorpay Test Payment Link. Click the control again first to show that the same link is reused rather than duplicated.

## 2:50 — Recover exactly once

Pay the Payment Link using Razorpay Test credentials. Wait for signed `payment_link.paid`, then show the same case as `RECOVERED`, recovered amount in the Overview, and provider IDs in Audit. Replay the provider event if available and show that no second case, action, or recovered amount appears.

## 3:40 — Safety guards

Use Demo Console **Late Authorization** to show a pending recovery cancelled with no customer contact. Use **Provider API Failure** to show escalation without a duplicate action. Explain that expired/cancelled link events also never count recovery.

## 4:20 — Recovery Lab

Open `/lab`, run seed `PULSEBACK-2026`, and explicitly call the result a deterministic synthetic benchmark—not production evidence. Only its summary persists and it never calls Razorpay.

## 4:50 — Close

“PulseBack now connects a real Test payment lifecycle to a controlled recovery engine: signed events, durable state, policy authorization, one provider action, exact association, and an audit trail. OpenAI, notifications, and live money remain intentionally disabled.”

## Credential-free fallback

If Test credentials are unavailable, run **Authentication Failure** in `/demo`, open the resulting `PULSEBACK DEMO` case, execute its simulated link, then use **Payment Link Recovery**. Show that the same services, state transitions, dashboard, and audit update, while clearly stating that provider calls are mocked.
