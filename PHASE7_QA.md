# PulseBack Phase 7 QA matrix

This matrix is the repeatable judge-proofing checklist. Automated rows are covered by Vitest; provider rows require configured test accounts and never use live money.

| Area | Failure or attack | Expected safe result |
| --- | --- | --- |
| Case commands | Two approvals at once | One state transition and audit; the other request receives a conflict |
| Case commands | Two Run Next Action clicks | One conditional action claim; no duplicate provider action |
| Re-analysis | Two model requests at once | One analysis claim; no duplicate decision/action |
| Terminal state | Run/stop/escalate after completion | Rejected without changing state |
| Webhooks | Same provider event ID twice | Database unique idempotency returns duplicate without new case/action/revenue |
| Webhooks | Different event ID replays an already paid link | Recovered revenue remains counted once |
| Webhooks | Wrong link, reference, case, or amount | Event is audited and rejected without recovery |
| Webhooks | Stale expired/cancelled/failure event after terminal state | Terminal status is preserved |
| Webhooks | Invalid signature, malformed JSON, or body over 1 MB | Rejected before business mutation |
| Groq/OpenAI | Missing key, timeout, 429, network error, invalid schema | Explicit deterministic fallback; Guardian still authorizes |
| Prompt injection | Instructions inside provider/customer fields | Untrusted text is excluded/sanitized and risk flagged |
| Email | Duplicate send click | Notification idempotency prevents a second accepted send |
| Email | Provider failure | Bounded retry, then escalation; no false delivery claim |
| Email | Recovered/stopped/fatigued/contact-limited case | Pre-send Guardian checks suppress contact |
| Payment Link | Existing active link | Existing persisted link is reused |
| Payment Link | Provider failure | Claimed action fails once and case escalates |
| Cron | Missing/incorrect secret | Fails closed |
| Public mutations | Request flood | Shared PostgreSQL fixed-window rate limits return 429 |
| Database | Read failure | Safe page error with retry; no secret-bearing diagnostic in the browser |
| Recovery Lab | Same seed and case count | Exactly reproducible synthetic result |

## Release commands

```powershell
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
git diff --check
```

For local persistent proof, also run `npm run verify:phase2` and `npm run verify:phase3` with a configured local PostgreSQL database. For hosted proof, follow `DEPLOYMENT.md` and verify `/api/health`, `/integrations`, a signed Razorpay Test webhook, and the controlled Resend test recipient.
