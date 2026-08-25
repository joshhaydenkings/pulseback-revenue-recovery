# PulseBack Phase 4 setup

## 1. Requirements

- Node.js 22.13+
- PostgreSQL 15+
- Optional OpenAI API key for live AI recommendations
- Optional Razorpay account in Test Mode and public HTTPS URL for webhooks

## 2. Install and configure

```powershell
npm install
Copy-Item .env.example .env.local
```

For local PostgreSQL, set `DATABASE_URL`, `DIRECT_URL`, `DATABASE_DRIVER=pg`, `DATABASE_RUNTIME=node`, and `DEMO_MODE=true`. Never prefix database or OpenAI secrets with `NEXT_PUBLIC_`.

For Neon/Cloudflare, use its pooled/serverless URL for `DATABASE_URL`, direct URL for `DIRECT_URL`, `DATABASE_DRIVER=neon`, and `DATABASE_RUNTIME=workerd`.

## 3. Apply migrations and seed

```powershell
npm run db:generate
npm run db:deploy
npm run db:seed
```

For schema development use `npm run db:migrate -- --name your_migration_name`. `npm run db:reset` is destructive and is only suitable for an explicitly configured development database.

## 4. Configure OpenAI (optional)

Set these server-only variables in `.env.local`:

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
```

Restart the development server after editing `.env.local`. If the key is absent or a request fails, the application remains usable through the deterministic fallback and shows the fallback reason on the case and Integrations pages.

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

## 6. Run in VS Code

```powershell
npm run dev:postgres
```

Open `http://localhost:3000`. Use `npm run dev` only for the Worker-compatible demo/Neon runtime.

## 7. Test AI safely

1. Open `/integrations`; verify the displayed provider, model, and connection state.
2. Open `/demo` and enable **Use Live AI** only when configured.
3. Run one failure scenario or the **AI Decision Test** synthetic case.
4. Open the case and compare **Provider Evidence**, **PulseBack AI Analysis**, and **Guardian Decision**.
5. Use **Re-analyze with AI** to persist a new decision. Confirm no action executes until normal approval/execution rules are followed.

The automated tests mock the API boundary and never use OpenAI credits.

## 8. Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run verify:phase2
npm run verify:phase3
npm run build
npm audit --omit=dev
```

## 9. Fallback states

- OpenAI unavailable: deterministic recommendation with `NOT_CONFIGURED`, `TIMEOUT`, `RATE_LIMIT`, `INVALID_RESPONSE`, or `API_ERROR`.
- Razorpay Test unavailable: mock payment provider.
- Database unavailable and `DEMO_MODE=true`: in-memory repository; server restart resets that fallback state.

## 10. Still mocked

- Email/SMS/WhatsApp execution
- Live Razorpay and live money movement
- Seed/demo data and Recovery Lab cases
