# Setup

## Local demo

1. Install Node.js 22.13 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Keep `DEMO_MODE=true`.
5. Run `npm run dev` and open `http://localhost:3000`.

No account or API key is required for the complete simulator, state machine, policy UI, audit views, failure scenario or Recovery Lab.

## Razorpay Test Mode

Add `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. Configure the dashboard webhook as `https://YOUR_HOST/api/webhooks/razorpay` for the six events listed in the README. Never use Live Mode credentials for this buildathon demo.

## OpenAI

Add `OPENAI_API_KEY`. `OPENAI_MODEL` is optional and centralizes the configured Responses API model. Missing or invalid output uses the deterministic fallback.

## Scheduled processing

`POST /api/cron/recovery` processes due actions. If `CRON_SECRET` is set, send `Authorization: Bearer YOUR_SECRET`. The Settings page includes a local “Process now” action so the demo never depends on cron.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
