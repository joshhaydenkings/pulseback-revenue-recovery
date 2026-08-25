# PulseBack

**AI Revenue Recovery Autopilot**

> Failed doesn’t mean lost.

PulseBack is a safe, explainable recovery layer that sits beside Razorpay. It detects failed payments, diagnoses the likely cause, predicts the most suitable intervention, passes that proposal through deterministic financial policies, executes or schedules the bounded action, and records the full outcome.

Built for the Razorpay AI Buildathon — Track 03: AI Revenue Recovery.

## Problem

Payment failures, abandoned checkouts, network timeouts and failed recurring charges can erase revenue after purchase intent already exists. A naïve retry system either leaves money behind or over-contacts customers. Financial automation needs context, state, stopping rules and an auditable authorization boundary.

## Solution

PulseBack combines a typed recovery state machine, customer recovery memory, an AI diagnosis layer, the deterministic **Guardian** policy engine, idempotent provider adapters and measurable outcomes.

The authority model is intentionally simple:

**AI recommends → Guardian authorizes → Executor acts**

The AI never receives unrestricted provider tools or direct financial authority.

## What makes PulseBack different

- **Recovery Opportunity Score** — deterministic 0–100 priority using amount, predicted probability, history, attempts, fatigue, risk and duplicate-link state.
- **Payment Autopsy** — concise evidence and merchant-facing diagnosis without hidden chain-of-thought.
- **Late Authorization Guard** — observes ambiguous network failures and cancels recovery if authorization arrives late.
- **Recovery Memory** — customer-level successes, attempts, contacts, preferences and fatigue shape every new case.
- **Guardian** — editable limits for amount, attempts, contacts, confidence, risk and repeated actions.
- **Shadow / Approval / Autopilot modes** — merchant-controlled authority.
- **What If? simulator** — compares predicted recovery, value and friction across possible interventions.
- **Revenue Leak Map** — shows failure category → intervention → outcome.
- **Recovery Lab** — reproducible seeded comparison of Baseline vs PulseBack over 50–500 identical synthetic cases.
- **Graceful provider failure** — a built-in action failure proves that duplicates are prevented and the case escalates safely.

## Architecture

```mermaid
flowchart LR
  R[Razorpay / Simulator] --> W[Webhook Gateway]
  W --> O[Recovery Orchestrator]
  O --> S[Typed State Machine]
  O --> D[Diagnosis Engine]
  D --> AI[OpenAI Responses API\nStructured recommendation]
  AI --> G[Guardian Policy Engine]
  G -->|Approved| E[Action Executor]
  G -->|Approval required| H[Merchant Review]
  G -->|Blocked| X[Stop / Escalate]
  E --> P[Razorpay Payment Links]
  E --> N[Simulated Email / SMS]
  O --> M[(Recovery Memory)]
  O --> A[(Audit History)]
  O --> DB[(Persistent adapter / Demo store)]
```

The hosted demo uses deterministic in-memory records so it runs without credentials. The repository keeps UI components separate from domain services and provider interfaces, allowing a persistent relational adapter to replace the demo store without changing product pages.

## Opportunity score

The score combines:

`probability value + log-adjusted amount + successful history + category weight − attempts − fatigue − risk − staleness − duplicate-link penalty`

Expected recoverable value is `amount × adjusted recovery probability`. Both are deterministic and unit-tested; the AI does not invent these numbers.

## Quick start

Requirements: Node.js 22.13 or newer.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The default is zero-credential demo mode.

## Demo mode

With `DEMO_MODE=true`, PulseBack uses:

- seeded Indian merchant-style customers and INR payments;
- `MockDecisionEngine` with explainable failure heuristics;
- an idempotent `MockPaymentProvider`;
- simulated email/SMS delivery;
- accelerated event scenarios and due-action processing;
- a deterministic Recovery Lab with visible seed `PULSEBACK-2026`.

Synthetic metrics are labeled **Synthetic benchmark results**. Provider actions are labeled simulated. No production performance claim is made.

## Razorpay Test Mode setup

1. Create or use a Razorpay Test Mode account.
2. Add the Test Mode key ID and secret to `.env.local`.
3. Set `NEXT_PUBLIC_RAZORPAY_KEY_ID` to the same public Test Mode key ID.
4. Create a strong webhook secret in Razorpay.
5. Set the webhook URL to `https://YOUR_HOST/api/webhooks/razorpay`.
6. Subscribe to `payment.failed`, `payment.authorized`, `payment.captured`, `payment_link.paid`, `payment_link.expired`, and `payment_link.cancelled`.
7. Put that exact webhook secret in `RAZORPAY_WEBHOOK_SECRET` and restart the server.

Webhook processing reads the raw body, verifies `X-Razorpay-Signature` with HMAC SHA-256, requires `x-razorpay-event-id`, ignores duplicates idempotently and accepts no unsigned webhook outside demo mode. Batch evaluation never calls Razorpay or consumes Test Mode Payment Links.

## OpenAI setup

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. The server uses the official OpenAI SDK and Responses API with a strict JSON schema validated by Zod. Invalid output falls back to deterministic heuristics and is designed to create an audit event. Keys and model calls remain server-side.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Revenue recovery overview and opportunity queue |
| `/recoveries` | Searchable, filtered recovery queue |
| `/recoveries/[id]` | Autopsy, AI proposal, Guardian, What If?, timeline and raw audit |
| `/leaks` | Interactive revenue leak flow and category effectiveness |
| `/lab` | Deterministic Baseline vs PulseBack benchmark |
| `/policies` | Editable Guardian and operating-mode controls |
| `/audit` | Filterable human-readable audit history |
| `/integrations` | Credential-safe integration health |
| `/demo` | Judge-friendly scripted scenarios |
| `/demo/events` | Internal event simulator using the recovery pipeline |
| `/demo/checkout` | Razorpay Standard Checkout Test Mode adapter |

## Security model

- Razorpay, OpenAI, database and cron secrets are server-only.
- Webhooks use raw-body HMAC verification and unique provider event IDs.
- Checkout signatures are verified server-side.
- Incoming API payloads are validated with Zod.
- Monetary values are paise in domain and API layers.
- Card numbers and CVV are never collected or stored by PulseBack.
- One active Payment Link per case is enforced before provider execution.
- The AI proposes structured decisions; only Guardian can authorize execution.
- Failed provider actions do not blindly retry or create duplicates.

## Testing

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The test suite covers scoring, amount policy, fatigue, signature verification, webhook idempotency, late authorization, duplicate links, AI fallback, state transitions, seeded evaluation and safe provider failure.

## Tech stack

Next.js-compatible App Router on Vinext, TypeScript, React 19, Tailwind CSS, Lucide, Recharts, Zod, official OpenAI SDK and Vitest. Sites produces a Cloudflare Worker-compatible ESM build.

## Further work

- Durable multi-merchant Postgres/Supabase repository and row-level tenancy.
- Real email, SMS and WhatsApp adapters with opt-out handling.
- Subscription and B2B invoice recovery.
- Merchant-specific recovery models and contextual bandits.
- Checkout abandonment telemetry and learned time-to-contact.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [SETUP.md](./SETUP.md), [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) and [JUDGING_NOTES.md](./JUDGING_NOTES.md).
