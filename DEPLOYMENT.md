# PulseBack public deployment

This guide deploys PulseBack as a public HTTPS application backed by managed PostgreSQL, Razorpay Test Mode, and Groq. It does not enable Razorpay Live Mode or real-money movement.

## 1. Choose the web and database runtimes

PulseBack supports two hosted combinations.

### Node.js host with managed PostgreSQL

Use a provider that runs a persistent Node.js server or Node serverless functions and permits PostgreSQL connections.

```text
DATABASE_DRIVER=pg
DATABASE_RUNTIME=node
```

Use the provider's pooled application URL for `DATABASE_URL`. Use its direct, non-pooler URL for `DIRECT_URL` so Prisma can safely apply migrations.

### Sites/Cloudflare-compatible host with Neon

Workers cannot open arbitrary raw TCP database sockets. Use Neon's pooled/serverless connection URL and the existing serverless adapter.

```text
DATABASE_DRIVER=neon
DATABASE_RUNTIME=workerd
```

Use the pooled/serverless Neon URL for `DATABASE_URL` and the direct Neon URL for `DIRECT_URL`. Do not select `DATABASE_DRIVER=pg` with `DATABASE_RUNTIME=workerd`; PulseBack rejects that combination.

## 2. Create managed PostgreSQL

1. Create a PostgreSQL database with your chosen managed provider.
2. Copy its pooled application URL into the hosted `DATABASE_URL` secret.
3. Copy its direct migration URL into `DIRECT_URL`.
4. Require TLS according to the provider's connection-string instructions.
5. Do not reuse the local Prisma development URL or any `localhost` URL.

PulseBack uses a cached Prisma client and a small production pool per runtime instance. The deployed application never needs `npm run db:start`, Docker, a local PostgreSQL process, or filesystem persistence.

## 3. Configure environment variables

Configure these in the hosting platform before building and deploying:

```text
DEMO_MODE
NEXT_PUBLIC_SITE_URL
DATABASE_URL
DIRECT_URL
DATABASE_DRIVER
DATABASE_RUNTIME
NEXT_PUBLIC_RAZORPAY_KEY_ID
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
AI_PROVIDER
GROQ_API_KEY
GROQ_MODEL
OPENAI_API_KEY
OPENAI_MODEL
EMAIL_PROVIDER
RESEND_API_KEY
EMAIL_FROM_ADDRESS
EMAIL_FROM_NAME
EMAIL_TEST_RECIPIENT
CRON_SECRET
```

OpenAI remains optional through `OPENAI_API_KEY` and `OPENAI_MODEL`; it is not required when `AI_PROVIDER=groq`.

Set `NEXT_PUBLIC_SITE_URL` to the final public HTTPS origin with no path, for example `https://YOUR_PUBLIC_SITE`. Public variables are embedded at build time, so rebuild and redeploy after changing it.

Use only Razorpay Test keys beginning with `rzp_test_`. PulseBack rejects `rzp_live_` credentials. Keep every variable except `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_RAZORPAY_KEY_ID` server-side.

## 4. Install and generate Prisma

From the repository root in CI or a trusted deployment shell:

```powershell
npm ci
npm run db:generate
```

`postinstall` also generates Prisma clients, but the explicit command makes deployment logs clear.

## 5. Apply migrations safely

With `DIRECT_URL` configured for the hosted database:

```powershell
npm run db:deploy
npm run db:verify
```

`db:deploy` applies committed migrations and preserves existing data. Never run `npm run db:migrate` or `npm run db:reset` as a normal deployment step. `db:migrate` is for creating migrations during development. `db:reset` refuses non-local databases.

## 6. Seed the judge database intentionally

Run this once only when you want the synthetic judge dataset:

```powershell
npm run db:seed
npm run db:verify
```

Seeding never runs automatically during deployment. If the fixed demo merchant already exists, the command skips all writes instead of deleting or duplicating records. Seeded payments are labeled `SYNTHETIC`; genuine provider exercises are labeled `RAZORPAY TEST`.

## 7. Build and deploy the web application

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

For a standard Node.js host, use:

```powershell
npm run start
```

For Sites or another Workers-compatible host, publish the generated Vinext worker output through that platform's normal deployment flow. Store runtime variables in the platform's environment/secret settings, not in committed `.env` files.

After the first deployment, confirm the stable HTTPS origin, set it as `NEXT_PUBLIC_SITE_URL`, then rebuild and deploy once more if it was not known during the first build.

## 8. Verify readiness

Open:

```text
https://YOUR_PUBLIC_SITE/api/health
```

A judge-ready environment returns HTTP 200 with `status: ready`. HTTP 503 with `status: degraded` means at least one required public integration is incomplete. The response includes only safe statuses and timestamps. Open `/integrations` for the human-readable cards.

Expected cards:

- Database: PostgreSQL — Connected
- Razorpay: Test Mode — Connected
- AI: Groq — Connected, or clearly marked fallback
- Email: Resend Connected, or clearly marked Mock Fallback

## 9. Configure Resend recovery email

1. Add and verify a sender domain in Resend. Complete its DNS verification before customer testing.
2. Create a restricted server-side API key and set `RESEND_API_KEY` in the host secret store.
3. Set `EMAIL_PROVIDER=resend`, `EMAIL_FROM_ADDRESS`, and `EMAIL_FROM_NAME`.
4. Set `EMAIL_TEST_RECIPIENT` to a controlled inbox. This fixed destination is the only recipient used by the Integrations test button.
5. Redeploy, open `/integrations`, and send the fixed test message.
6. Inspect Resend logs and the PulseBack audit trail. API acceptance is recorded as `SENT`; PulseBack does not label it delivered without delivery confirmation.

Never publish `RESEND_API_KEY`, never prefix it with `NEXT_PUBLIC_`, and never commit it. Resend's shared test sender can only send to the account email; use a verified domain for other recipients. Keep unsubscribe/compliance and domain reputation requirements appropriate to your production use.

## 10. Configure the Razorpay Test webhook

In the Razorpay Dashboard, remain in **Test Mode** and create this webhook:

```text
https://YOUR_PUBLIC_SITE/api/webhooks/razorpay
```

Set a webhook secret and place the same value in `RAZORPAY_WEBHOOK_SECRET`. Enable exactly the events currently handled by PulseBack:

- `payment.failed`
- `payment.authorized`
- `payment.captured`
- `payment_link.paid`
- `payment_link.expired`
- `payment_link.cancelled`

The route reads the raw request body, verifies Razorpay HMAC before parsing or mutation, and uses the persisted provider event ID for idempotency. Do not place this endpoint behind a body-transforming proxy.

## 11. Verify Groq

Configure:

```text
AI_PROVIDER=groq
GROQ_API_KEY
GROQ_MODEL=openai/gpt-oss-20b
```

Open `/integrations` and confirm Groq, the configured model, and the last successful decision. The key stays server-side. If Groq is unavailable, PulseBack records the fallback reason and uses the deterministic engine; Guardian remains the only execution authority.

## 12. Configure cron

Schedule an HTTPS request every 1–5 minutes:

```text
POST https://YOUR_PUBLIC_SITE/api/cron/recovery
Authorization: Bearer YOUR_CRON_SECRET
```

The endpoint fails closed when `CRON_SECRET` is missing, re-validates Guardian and current case state, and returns real `processed`, `succeeded`, `failed`, and `skipped` counts. It is provider-neutral and can be called by any scheduler that supports an Authorization header.

## 13. Public judge test

1. Open deployed PulseBack.
2. Confirm PostgreSQL Connected on `/integrations`.
3. Confirm Razorpay Test Connected.
4. Confirm Groq Connected.
5. Start ₹4,999 Razorpay Test Checkout from `/demo/checkout`.
6. Complete a Razorpay Test payment failure.
7. Confirm the signed webhook reaches `/api/webhooks/razorpay`.
8. Confirm the new `RAZORPAY TEST` recovery case appears.
9. Confirm the Groq recommendation appears on the case.
10. Confirm Guardian independently evaluates it.
11. Create or approve the Razorpay Test Payment Link.
12. Open the persisted recovery link.
13. Complete the Test payment.
14. Confirm `payment_link.paid` reaches the public webhook.
15. Confirm the exact case becomes `RECOVERED`.
16. Confirm recovered revenue increases once.
17. Refresh the browser and confirm the state remains.
18. Replay the same provider event from Razorpay where practical.
19. Confirm no duplicate case, action, or recovered revenue appears.
20. Check `/audit` for the complete append-only history.

## 14. Security and operational notes

- Public mutation routes use PostgreSQL-backed fixed-window counters, so limits are shared across horizontally scaled instances. The zero-config memory limiter is labeled demo-only.
- Webhook protection relies on Razorpay HMAC plus database idempotency and is not subject to arbitrary rate blocking.
- API failures return safe client messages. Server diagnostics redact connection strings, authorization values, and provider-key patterns.
- Security headers are enabled. A Content Security Policy is intentionally not added until it can be nonce-based and fully tested with Razorpay Checkout.
- Authentication and merchant isolation are intentionally deferred for the hackathon build; rate limiting is not a substitute for authentication.
- Email is genuine only when the Integrations page shows **Resend Connected**; otherwise the mock adapter simulates it without external delivery. SMS and WhatsApp remain unconnected.
- Webhook request bodies larger than 1 MB are rejected. Keep any reverse-proxy limit at or below the same boundary and preserve the raw body for HMAC verification.
- Use `npm run db:reset` only for the local development database. There is deliberately no public destructive reset endpoint.
