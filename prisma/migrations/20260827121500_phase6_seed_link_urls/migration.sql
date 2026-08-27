UPDATE "RecoveryAction" AS action
SET
  "providerUrl" = 'https://rzp.io/i/demo-' || action."recoveryCaseId",
  "providerStatus" = COALESCE(action."providerStatus", 'created'),
  "metadata" = COALESCE(action."metadata", '{}'::jsonb) || jsonb_build_object(
    'synthetic', true,
    'source', 'DEMO_BACKFILL',
    'amountPaise', payment."amount"
  )
FROM "RecoveryCase" AS recovery
JOIN "Payment" AS payment ON payment."id" = recovery."paymentId"
WHERE action."recoveryCaseId" = recovery."id"
  AND action."type" = 'CREATE_PAYMENT_LINK'
  AND action."providerReference" LIKE 'plink_demo_%'
  AND action."providerUrl" IS NULL;
