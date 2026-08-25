ALTER TABLE "RecoveryDecision"
ADD COLUMN "failureCategory" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "diagnosis" TEXT NOT NULL DEFAULT 'Deterministic recovery analysis',
ADD COLUMN "suggestedWaitMinutes" INTEGER,
ADD COLUMN "customerFriction" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "urgency" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "decisionProvider" TEXT NOT NULL DEFAULT 'DETERMINISTIC',
ADD COLUMN "model" TEXT,
ADD COLUMN "fallbackReason" TEXT;

UPDATE "RecoveryDecision" AS decision
SET
  "failureCategory" = recovery."failureCategory",
  "diagnosis" = recovery."diagnosis"
FROM "RecoveryCase" AS recovery
WHERE recovery."id" = decision."recoveryCaseId";

CREATE INDEX "RecoveryDecision_decisionProvider_createdAt_idx"
ON "RecoveryDecision"("decisionProvider", "createdAt");
