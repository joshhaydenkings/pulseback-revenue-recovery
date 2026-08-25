# PulseBack architecture

## Boundaries

1. Razorpay secrets exist only in server configuration and the provider adapter.
2. Checkout receives only the public Test key. PulseBack never handles card data.
3. Raw webhook bytes are authenticated before JSON parsing or mutation.
4. Razorpay and simulator payloads normalize into one `RecoveryEventInput` contract.
5. PostgreSQL idempotency is claimed in the same transaction as recovery state changes.
6. Deterministic Guardian policy—not an LLM—authorizes actions in Phase 3.
7. Provider execution is claimed atomically before the external API call; an active stored link is reused.

## Request flow

```mermaid
sequenceDiagram
  participant U as Test customer
  participant C as PulseBack Checkout
  participant R as Razorpay Test API
  participant W as Signed webhook route
  participant P as Recovery service
  participant DB as PostgreSQL

  U->>C: Start Test Checkout
  C->>R: Server creates Test Order
  C->>DB: Persist ProviderOrder + audit
  R-->>C: Standard Checkout result
  C->>C: Server verifies Checkout signature
  R->>W: payment.failed + HMAC signature
  W->>W: Verify raw body, normalize event
  W->>P: Shared RecoveryEventInput
  P->>DB: Atomic event/payment/case/decision/action/audit
  P->>R: Create Test Payment Link after Guardian approval
  P->>DB: Persist link ID, URL, status, expiry, reference
  U->>R: Pay Test Payment Link
  R->>W: payment_link.paid + HMAC signature
  W->>P: Same pipeline
  P->>DB: Validate link + reference + amount; recover exactly once
```

Checkout verification is defense-in-depth and never marks a case recovered. Signed webhooks remain authoritative, so processing continues if the browser closes.

## Persistence model

Prisma/PostgreSQL stores:

- `ProviderOrder`: Test order ID, receipt, amount, status, customer, verification result
- `Payment`: original or recovery payment IDs, order ID, paise, failure details, provider metadata, provenance
- `RecoveryCase`: state, economics, diagnosis, strategy, active link, recovered amount
- `RecoveryDecision`: deterministic proposal and Guardian result
- `RecoveryAction`: execution claim, provider link ID/URL/status/expiry, errors, metadata
- `WebhookEvent`: raw normalized payload and unique `(provider, providerEventId)`
- `AuditEvent`: append-oriented human and provider history
- Merchant, Customer, Policy, and EvaluationRun support the surrounding product

## Idempotency and duplicate protection

- Unique database constraint on webhook provider/event ID
- Stable raw-body digest fallback when no provider event-ID header is present
- Unique provider reference on recovery actions
- Atomic `EXECUTING` claim before provider calls
- Existing active link returned to repeated clicks
- Paid recovery applied only if the case is not already recovered
- Exact link ID, `pulseback_recovery_<caseId>` reference, and paise amount required

## Provider selection

`PaymentProvider` has real Razorpay Test and mock implementations. A Razorpay-origin case prefers the Test adapter only when the central configuration is complete and valid. Seeded/demo cases remain mock so a showcase never accidentally calls the provider. Missing credentials fall back; live or inconsistent keys are rejected.

## Late authorization

`payment.authorized` or `payment.captured` arriving before recovery execution cancels pending actions, marks the case `SELF_RECOVERED`, and records that no customer recovery contact occurred.

## Failure handling

Provider failures persist the action error, escalate the case, and do not claim that a link was delivered. Expired/cancelled links clear the active link and never increase recovered revenue.
