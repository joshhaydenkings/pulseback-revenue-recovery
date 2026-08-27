# PulseBack hosted-readiness setup

## 1. Requirements

- Node.js 22.13+
- PostgreSQL 15+
- Optional Groq API key for live AI recommendations (OpenAI is also supported)
- Optional Razorpay account in Test Mode and public HTTPS URL for webhooks
- Optional Resend account and verified sender domain for real recovery email

## 2. Install and configure

```powershell
npm install
Copy-Item .env.example .env.local
```

For local PostgreSQL, set `DATABASE_URL`, `DIRECT_URL`, `DATABASE_DRIVER=pg`, `DATABASE_RUNTIME=node`, and `DEMO_MODE=true`. Never prefix database or AI-provider secrets with `NEXT_PUBLIC_`.

If you use Prisma's bundled local PostgreSQL server, start it first and copy the printed TCP connection string into both `DATABASE_URL` and `DIRECT_URL`:

```powershell
npx prisma dev -d
```

After the first creation, restart or stop the database with `npm run db:start` and `npm run db:stop`. The local server keeps its assigned ports. If Prisma creates a new server with different ports, update both URLs before migrating.

For Neon/Cloudflare, use its pooled/serverless URL for `DATABASE_URL`, direct URL for `DIRECT_URL`, `DATABASE_DRIVER=neon`, and `DATABASE_RUNTIME=workerd`.

## 3. Apply migrations and seed

```powershell
npm run db:generate
npm run db:deploy
npm run db:seed
npm run db:verify
```

For schema development use `npm run db:migrate -- --name your_migration_name`. `npm run db:reset` is destructive and has a hard guard that permits localhost databases only. Never use reset for a hosted database. Use `npm run db:deploy` to apply committed migrations in deployment.

`npm run db:seed` is intentional and idempotence-protected. If `merchant_demo` already exists, it exits without deleting, replacing, or duplicating data.

## 4. Configure Groq (optional)

Set these server-only variables in `.env.local`:

```text
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
```

Create the key in the Groq Console, keep it server-only, and restart the development server after editing `.env.local`. If the key is absent or a request fails, the application remains usable through the deterministic fallback and shows the fallback reason on the case and Integrations pages. To use OpenAI instead, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL`.

## 5. Configure Razorpay Test Mode (optional)

```text
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

The key IDs must match. PulseBack rejects live keys. Set the Test webhook URL to `https://YOUR_PUBLIC_HOST/api/webhooks/razorpay` and enable:

- `payment.failed`
- `payment.authorized`
- `payment.captured`
- `payment_link.paid`
- `payment_link.expired`
- `payment_link.cancelled`

Use the same secret in Razorpay and `RAZORPAY_WEBHOOK_SECRET`. Do not commit tunnel tokens or credentials.

## 6. Configure recovery email (optional)

Create a Resend API key and verify the sending domain/address in Resend. Then set only server-side values in `.env.local`:

```text
EMAIL_PROVIDER=resend
RESEND_API_KEY=
EMAIL_FROM_ADDRESS=
EMAIL_FROM_NAME=PulseBack Recovery
EMAIL_TEST_RECIPIENT=
```

`EMAIL_TEST_RECIPIENT` is the only destination used by the Integrations test button; the UI cannot provide an arbitrary recipient. Restart the app, open `/integrations`, and confirm **RESEND CONNECTED**. First use **Send fixed test email**, then create a Test Payment Link on a recovery case, preview the controlled email, and send it. Provider acceptance means sent, not delivered. If configuration is missing, PulseBack stays in mock mode and no message leaves the application.

## 7. Run in VS Code

```powershell
npm run dev:postgres
```

Open `http://localhost:3000`. Use `npm run dev` only for the Worker-compatible demo/Neon runtime.

`npm run db:start` starts only the bundled local Prisma PostgreSQL server. A hosted application never runs it; it connects directly to managed PostgreSQL through `DATABASE_URL`.

## 8. Test AI safely

1. Open `/integrations`; verify the displayed provider, model, and connection state.
2. Open `/demo` and enable **Use Live AI** only when configured.
3. Run one failure scenario or the **AI Decision Test** synthetic case.
4. Open the case and compare **Provider Evidence**, **PulseBack AI Analysis**, and **Guardian Decision**.
5. Use **Re-analyze with AI** to persist a new decision. Confirm no action executes until normal approval/execution rules are followed.

The automated tests mock the API boundary and never use provider credits.

## 9. Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run verify:phase2
npm run verify:phase3
npm run db:verify
npm run build
npm audit --omit=dev
```

## 10. Fallback states

- Hosted AI unavailable: deterministic recommendation with `NOT_CONFIGURED`, `TIMEOUT`, `RATE_LIMIT`, `INVALID_RESPONSE`, or `API_ERROR`.
- Razorpay Test unavailable: mock payment provider.
- Database unavailable and `DEMO_MODE=true`: in-memory repository; server restart resets that fallback state.
- Resend unavailable or incomplete: explicit mock/simulated notification adapter.

## 11. Still mocked

- SMS/WhatsApp execution
- Email when `EMAIL_PROVIDER=resend` is not fully configured
- Live Razorpay and live money movement
- Seed/demo data and Recovery Lab cases

## 12. Hosted deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for managed PostgreSQL, public HTTPS, Razorpay Test webhook, Groq, cron, and the final judge workflow.
