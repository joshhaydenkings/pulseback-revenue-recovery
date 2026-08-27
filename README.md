# PulseBack

**Guarded AI revenue recovery for Razorpay Test Mode**

> Failed does not mean lost.

PulseBack turns failed-payment events into persistent recovery cases. A hosted AI provider can diagnose the failure and recommend one bounded strategy; the deterministic Guardian remains the only authority that can approve, require merchant review, or block an action. Groq is the default hosted provider, with OpenAI retained as an optional alternative.

Built for the Razorpay AI Buildathon — Track 03: AI Revenue Recovery.

## Authority model

**Hosted AI recommends → Guardian authorizes → merchant or provider adapter acts**

AI never executes a payment operation, bypasses policy, changes money, or controls funds. If the selected provider is not configured, times out, is rate-limited, returns invalid structured output, or fails, PulseBack persists an explicit fallback reason and continues through the deterministic engine.

## What is real

- Groq uses its OpenAI-compatible Responses API through a server-only client and strict structured output. OpenAI remains selectable.
- Minimal structured context excludes customer name, email, phone, secrets, raw webhook payloads, and full card/payment identifiers.
- Provider text is untrusted data; instruction-like content is omitted and raised as a risk flag.
- Every recommendation, provider/model identity, fallback reason, Guardian result, action, and webhook outcome is persisted and audited.
- Re-analysis creates a new decision and pending plan but never executes a financial action automatically.
- Razorpay Test Orders, signed webhooks, and Test Payment Links use the genuine provider adapter when Test credentials are configured.
- PostgreSQL uniqueness and transactional writes preserve exact-once event handling across restarts.
- Resend can send a controlled recovery email containing the exact persisted Razorpay Test Payment Link; notification status, provider ID, retries, and idempotency are stored in PostgreSQL.

## Safe fallback

- Missing selected-provider key: `NOT_CONFIGURED` deterministic fallback.
- Timeout, rate limit, malformed schema, or API failure: explicit persisted fallback reason.
- Missing Razorpay Test credentials: clearly labeled mock provider.
- Missing `DATABASE_URL` with `DEMO_MODE=true`: clearly labeled in-memory demo repository.
- `rzp_live_` credentials are rejected; this build never moves live money.

## Quick start

Requirements: Node.js 22.13+ and PostgreSQL 15+ for persistent mode.

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:deploy
npm run db:seed
npm run db:verify
npm run dev:postgres
```

Open `http://localhost:3000`. See [SETUP.md](./SETUP.md) for exact environment and webhook setup.

For a public deployment with managed PostgreSQL, follow [DEPLOYMENT.md](./DEPLOYMENT.md). The hosted application connects directly through `DATABASE_URL`; it never runs `npm run db:start` and never depends on a developer laptop.

## Optional hosted AI configuration

Add server-only values to `.env.local`:

```text
AI_PROVIDER=groq
GROQ_API_KEY
GROQ_MODEL=openai/gpt-oss-20b
```

To use OpenAI instead:

```text
AI_PROVIDER=openai
OPENAI_API_KEY
OPENAI_MODEL=gpt-5-mini
```

Never prefix provider keys with `NEXT_PUBLIC_`. Recovery Lab remains deterministic and does not call hosted AI.

## Razorpay Test configuration

```text
NEXT_PUBLIC_RAZORPAY_KEY_ID
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
```

Both key IDs must be the same `rzp_test_...` value. Configure the Test webhook as `https://YOUR_PUBLIC_HOST/api/webhooks/razorpay` and subscribe to `payment.failed`, `payment.authorized`, `payment.captured`, `payment_link.paid`, `payment_link.expired`, and `payment_link.cancelled`.

## Recovery email configuration

PulseBack uses a server-only provider abstraction. Resend is the real email adapter; missing or incomplete configuration falls back to an explicitly simulated mock adapter.

```text
EMAIL_PROVIDER=resend
RESEND_API_KEY
EMAIL_FROM_ADDRESS
EMAIL_FROM_NAME=PulseBack Recovery
EMAIL_TEST_RECIPIENT
```

Verify `EMAIL_FROM_ADDRESS` in Resend before sending to customers. A Resend test-domain sender is restricted to the address associated with the Resend account. The browser never submits a recipient, body, amount, or CTA URL: it submits only the recovery case ID, and the server reloads all trusted values from PostgreSQL. A provider acceptance is displayed as **sent/accepted**, never as delivered unless a provider delivery event confirms it.

## PostgreSQL

Amounts are integer paise. Prisma persists merchants, customers, provider orders, payments, cases, decisions, actions, notification deliveries, audit events, webhook idempotency, policies, and evaluation summaries.

- Local Node/PostgreSQL: `DATABASE_DRIVER=pg`, `DATABASE_RUNTIME=node`, `npm run dev:postgres`.
- Sites/Cloudflare: Neon with `DATABASE_DRIVER=neon`, `DATABASE_RUNTIME=workerd`; use the pooled URL for `DATABASE_URL` and direct URL for `DIRECT_URL`.

The Prisma client is cached per runtime instance to avoid needless connection pools. `npm run db:deploy` applies committed migrations without resetting data. `npm run db:seed` is explicit and skips an existing demo merchant rather than duplicating or replacing it. `npm run db:reset` refuses non-local databases.

## Hosted readiness and security

- `GET /api/health` returns only safe connection states, provider names, model names, and timestamps. It never returns credentials, keys, or secrets.
- The Integrations page distinguishes PostgreSQL Connected/Demo/Unavailable, Razorpay Test, hosted AI/fallback, and Resend/mock email.
- Public mutation routes use shared PostgreSQL rate-limit buckets when the database is configured. The in-memory limiter exists only for the zero-config demo fallback.
- The Razorpay webhook keeps raw-body HMAC verification and database idempotency; it is not blocked by arbitrary request throttling.
- Security headers include MIME sniffing protection, a strict referrer policy, same-origin frame protection, a restrictive permissions policy, and HSTS on configured HTTPS builds. A CSP is intentionally deferred because an incomplete policy could break Razorpay Checkout.
- `CRON_SECRET` is mandatory for `/api/cron/recovery`. The UI's clearly labeled demo control uses a separate rate-limited demo endpoint.
- Provider events larger than 1 MB are rejected before signature/configuration work. Malformed and unsigned Razorpay payloads never enter the recovery pipeline.
- Case approval, re-analysis, action execution, Payment Link creation, and notification delivery use atomic claims or unique idempotency keys to reject concurrent duplicates.
- Terminal `RECOVERED`, `SELF_RECOVERED`, `STOPPED`, and `FAILED` cases cannot be restarted by stale provider events or case commands.
- Server-rendered failures show a safe retry screen; route navigation has a meaningful loading state. Expected mutation failures remain inline and do not expose provider or database diagnostics.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run verify:phase2
npm run verify:phase3
npm run build
npm audit --omit=dev
```

Tests use injected fake provider response boundaries; they never consume API credits or send email. A live AI request is available only through the Demo Console when a key is configured.

## Main routes

| Route | Purpose |
| --- | --- |
| `/` | Database-backed recovery overview |
| `/recoveries` | Persistent recovery queue |
| `/recoveries/[id]` | Provider evidence, AI analysis, Guardian result, actions, timeline |
| `/integrations` | Safe Razorpay and hosted-AI status without secrets |
| `/api/health` | Safe deployment readiness status for monitoring |
| `/demo` | Stateful scenarios, Live AI toggle, and synthetic AI decision test |
| `/demo/checkout` | Razorpay Test Order and Standard Checkout |
| `/audit` | Persistent append-oriented audit trail |
| `/policies` | Persistent Guardian and operating mode |
| `/lab` | Deterministic synthetic benchmark; no hosted-AI call |

## Still simulated or deferred

- Email delivery is real only when the Integrations page shows **Resend Connected**; otherwise it is explicitly simulated. SMS and WhatsApp are not connected.
- Live Razorpay credentials and real money movement
- Authentication, merchant onboarding, and multi-tenant isolation
- Seeded demo cases and Recovery Lab inputs are synthetic
- Hosted AI is optional and falls back safely when unavailable
- A Content Security Policy remains deferred until a nonce-based Razorpay Checkout policy is fully tested.
- Public deployment requires separately configured host secrets and managed PostgreSQL; repository verification cannot prove third-party account approval or inbox delivery.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [DEMO_SCRIPT.md](./DEMO_SCRIPT.md), and [JUDGING_NOTES.md](./JUDGING_NOTES.md).
