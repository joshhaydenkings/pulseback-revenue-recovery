# PulseBack Phase 3 setup

## 1. Requirements

- Node.js 22.13+
- PostgreSQL 15+
- A Razorpay account switched to **Test Mode** for genuine provider testing
- A public HTTPS host or tunnel for local webhooks

## 2. Install

```powershell
npm install
Copy-Item .env.example .env.local
```

`npm install` generates both Prisma clients.

## 3. Configure PostgreSQL

For a conventional local PostgreSQL server:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DIRECT_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_DRIVER=pg
DATABASE_RUNTIME=node
DEMO_MODE=true
```

Never prefix database variables with `NEXT_PUBLIC_`.

For Sites/Cloudflare, use Neon PostgreSQL because Workers cannot open arbitrary PostgreSQL TCP sockets. Set `DATABASE_DRIVER=neon`, `DATABASE_RUNTIME=workerd`, use the Neon pooled/serverless connection for `DATABASE_URL`, and its direct connection for `DIRECT_URL`.

## 4. Apply migrations and seed

```powershell
npm run db:generate
npm run db:deploy
npm run db:seed
```

For schema development:

```powershell
npm run db:migrate -- --name your_migration_name
```

To reset an explicitly configured development database:

```powershell
npm run db:reset
```

`db:reset` is destructive. Never point it at production data.

## 5. Configure Razorpay Test Mode

In Razorpay Dashboard, switch to Test Mode and create Test API keys. Put only Test values in `.env.local`:

```text
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

The two key IDs must match. PulseBack rejects `rzp_live_` keys. Secrets remain server-only.

Create a Razorpay Test webhook pointing to:

```text
https://YOUR_PUBLIC_HOST/api/webhooks/razorpay
```

Enable:

- `payment.failed`
- `payment.authorized`
- `payment.captured`
- `payment_link.paid`
- `payment_link.expired`
- `payment_link.cancelled`

Use exactly the same webhook secret in Razorpay and `RAZORPAY_WEBHOOK_SECRET`.

For local testing, expose port 3000 through a trusted HTTPS tunnel, place the resulting host in `NEXT_PUBLIC_SITE_URL`, and restart the app after changing environment variables. Do not put a tunnel authentication token in the repository.

## 6. Run in VS Code

Open the project folder and run this in the VS Code terminal:

```powershell
npm run dev:postgres
```

Then open `http://localhost:3000`. Use `npm run dev` only for the Worker-compatible demo/Neon runtime.

## 7. Judge flow

1. Open `/integrations` and confirm **Razorpay Test Mode — Connected**, key masked, and webhook configured.
2. Open `/demo/checkout`, create a Test Order, and use Razorpay Test Checkout.
3. Cause a Test payment failure.
4. Wait for the signed `payment.failed` webhook; the page polls only for display and is not required for processing.
5. Open the new `RAZORPAY TEST` recovery case.
6. Approve it if Guardian requires approval, then run the next action.
7. Open the persisted Razorpay Test Payment Link and complete it with Test credentials.
8. Confirm signed `payment_link.paid` marks the same case recovered once.
9. Refresh and restart the server; state and event idempotency remain in PostgreSQL.

No real money is involved.

## 8. Verification commands

```powershell
npm run lint
npm run typecheck
npm test
npm run verify:phase3
npm run build
npm audit --omit=dev
```

The credential-free test suite validates signatures, payload mapping, adapter request/response mapping, provider errors, amount mismatch rejection, link terminal states, and exact-once recovery. `verify:phase3` additionally verifies the PostgreSQL repository with a Razorpay-origin event while safely using the mock provider if Test credentials are absent.

## 9. Safe fallback

- Missing Razorpay Test credentials: **Demo Provider active**; no real Razorpay API request occurs.
- Invalid/incomplete credentials: integration is blocked with a clear status.
- Missing `DATABASE_URL` plus `DEMO_MODE=true`: deterministic in-memory repository; refreshes work, but a server restart resets state.

## 10. Still mocked

- Deterministic diagnosis; OpenAI is disconnected for Phase 3
- Email and SMS execution
- Seeded demo cases and Recovery Lab
- Live Razorpay and live money movement are prohibited
