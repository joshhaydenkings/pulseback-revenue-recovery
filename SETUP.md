# PulseBack setup

## Requirements

- Node.js 22.13 or newer
- PostgreSQL 15 or newer for persistent mode

## Install

```powershell
npm install
Copy-Item .env.example .env
```

`npm install` runs `prisma generate` automatically.

## Zero-config demo fallback

Keep `DEMO_MODE=true` and leave `DATABASE_URL` empty:

```powershell
npm run dev
```

This preserves the populated deterministic demo. It is server-driven but intentionally resets when the server process restarts.

## Persistent PostgreSQL mode

Set these variables in `.env`:

- `DATABASE_URL`: the runtime application connection
- `DIRECT_URL`: a direct PostgreSQL connection used by Prisma migrations
- `DATABASE_DRIVER`: `pg` for local/Node PostgreSQL, or `neon` for Neon serverless PostgreSQL
- `DATABASE_RUNTIME`: `node` for local PostgreSQL, or `workerd` for Sites/Cloudflare
- `DEMO_MODE`: keep `true` while using synthetic Phase 2 scenarios

Never expose either database URL through a `NEXT_PUBLIC_` variable.

For local PostgreSQL and Node runtimes, `DATABASE_URL` may be a pooled connection and `DIRECT_URL` should be direct. For the Sites/Cloudflare worker deployment, use Neon: set `DATABASE_DRIVER=neon`, set `DATABASE_RUNTIME=workerd`, provide its pooled/serverless runtime URL as `DATABASE_URL`, and its direct URL as `DIRECT_URL`. Sites cannot open arbitrary raw TCP PostgreSQL connections.

## Migration and seed

Create a development migration after editing `prisma/schema.prisma`:

```powershell
npm run db:migrate -- --name describe_the_change
```

Apply committed migrations:

```powershell
npm run db:deploy
```

Load the deterministic synthetic merchant, customers, payments, cases, decisions, actions, policies and audit history:

```powershell
npm run db:seed
```

Reset a development database:

```powershell
npm run db:reset
```

`db:reset` is destructive and must only target an explicitly configured development database.

## Run

```powershell
npm run dev:postgres
```

Open `http://localhost:3000`.

`npm run dev` remains the Worker-compatible command for zero-config fallback or Neon-backed Sites development. Use `npm run dev:postgres` for a conventional local PostgreSQL server over TCP.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

With a seeded development PostgreSQL database configured, the persistent Phase 2 verification is:

```powershell
npm run verify:phase2
```

It creates a ₹4,999 failure, confirms Payment/RecoveryCase/RecoveryAction persistence, processes a due action, completes simulated recovery, confirms dashboard aggregation, verifies duplicate-event protection and verifies policy persistence. It uses only mock providers.

## Scheduled processing

`POST /api/cron/recovery` queries actual scheduled actions whose `scheduledFor` time is due. If `CRON_SECRET` is configured, provide `Authorization: Bearer <secret>`. The Settings page provides a local **Process now** control.

## Deliberately mocked in Phase 2

- Deterministic decision engine; OpenAI is not called
- Mock Payment Provider and DEMO/SIMULATED Payment Links
- Mock notification execution; no email or SMS leaves the app
- Razorpay signatures can be validated, but production Razorpay execution is not enabled
