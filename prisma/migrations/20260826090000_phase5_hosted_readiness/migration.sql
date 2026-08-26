-- Shared, database-backed fixed-window counters for public mutation routes.
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "identityHash" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
CREATE INDEX "RateLimitBucket_scope_windowStart_idx" ON "RateLimitBucket"("scope", "windowStart");

-- Make existing demo provenance explicit without touching Razorpay Test records.
UPDATE "Payment"
SET "provenance" = 'SYNTHETIC_DEMO'
WHERE "provenance" = 'PULSEBACK_DEMO';
