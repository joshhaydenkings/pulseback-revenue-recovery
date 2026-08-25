-- CreateEnum
CREATE TYPE "OperatingMode" AS ENUM ('SHADOW', 'APPROVAL', 'AUTOPILOT');

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('DETECTED', 'PENDING_OBSERVATION', 'ANALYZING', 'PLAN_READY', 'AWAITING_APPROVAL', 'SCHEDULED', 'ACTION_IN_PROGRESS', 'RECOVERING', 'RECOVERED', 'SELF_RECOVERED', 'ESCALATED', 'STOPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'SCHEDULED', 'APPROVED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REJECTED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operatingMode" "OperatingMode" NOT NULL DEFAULT 'AUTOPILOT',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "autonomousAmountThreshold" INTEGER NOT NULL DEFAULT 2500000,
    "observationWindowMinutes" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "externalCustomerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "totalSuccessfulPayments" INTEGER NOT NULL DEFAULT 0,
    "totalFailedPayments" INTEGER NOT NULL DEFAULT 0,
    "lastContactAt" TIMESTAMP(3),
    "recoveryFatigueScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureCode" TEXT,
    "failureDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCase" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "status" "RecoveryStatus" NOT NULL,
    "failureCategory" TEXT NOT NULL,
    "opportunityScore" INTEGER NOT NULL,
    "predictedRecoveryProbability" DOUBLE PRECISION NOT NULL,
    "expectedRecoverableValue" INTEGER NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "currentStrategy" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "recoveredAmount" INTEGER NOT NULL DEFAULT 0,
    "recoveryStartedAt" TIMESTAMP(3),
    "recoveredAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "activePaymentLinkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryDecision" (
    "id" TEXT NOT NULL,
    "recoveryCaseId" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "estimatedRecoveryProbability" DOUBLE PRECISION NOT NULL,
    "merchantExplanation" TEXT NOT NULL,
    "supportingEvidence" JSONB NOT NULL,
    "riskFlags" JSONB NOT NULL,
    "guardianDecision" TEXT NOT NULL,
    "guardianReasons" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryAction" (
    "id" TEXT NOT NULL,
    "recoveryCaseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ActionStatus" NOT NULL,
    "providerReference" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "recoveryCaseId" TEXT,
    "category" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "operatingMode" "OperatingMode" NOT NULL,
    "autonomousAmountThresholdPaise" INTEGER NOT NULL,
    "observationWindowMinutes" INTEGER NOT NULL,
    "maxAttemptsPerCase" INTEGER NOT NULL,
    "contactsPer24h" INTEGER NOT NULL,
    "contactsPer7d" INTEGER NOT NULL,
    "minimumConfidence" DOUBLE PRECISION NOT NULL,
    "highRiskAutoStop" BOOLEAN NOT NULL,
    "newCustomerApprovalThresholdPaise" INTEGER NOT NULL,
    "preventRepeatedAction" BOOLEAN NOT NULL,
    "fatigueStopThreshold" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRun" (
    "id" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "caseCount" INTEGER NOT NULL,
    "revenueAtRisk" INTEGER NOT NULL,
    "baselineRecovered" INTEGER NOT NULL,
    "pulseBackRecovered" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_merchantId_idx" ON "Customer"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_merchantId_externalCustomerId_key" ON "Customer"("merchantId", "externalCustomerId");

-- CreateIndex
CREATE INDEX "Payment_merchantId_status_idx" ON "Payment"("merchantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCase_paymentId_key" ON "RecoveryCase"("paymentId");

-- CreateIndex
CREATE INDEX "RecoveryCase_merchantId_status_idx" ON "RecoveryCase"("merchantId", "status");

-- CreateIndex
CREATE INDEX "RecoveryCase_nextActionAt_idx" ON "RecoveryCase"("nextActionAt");

-- CreateIndex
CREATE INDEX "RecoveryDecision_recoveryCaseId_createdAt_idx" ON "RecoveryDecision"("recoveryCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "RecoveryAction_status_scheduledFor_idx" ON "RecoveryAction"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "RecoveryAction_recoveryCaseId_status_idx" ON "RecoveryAction"("recoveryCaseId", "status");

-- CreateIndex
CREATE INDEX "AuditEvent_merchantId_createdAt_idx" ON "AuditEvent"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_recoveryCaseId_createdAt_idx" ON "AuditEvent"("recoveryCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_merchantId_key" ON "Policy"("merchantId");

-- CreateIndex
CREATE INDEX "EvaluationRun_createdAt_idx" ON "EvaluationRun"("createdAt");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryDecision" ADD CONSTRAINT "RecoveryDecision_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAction" ADD CONSTRAINT "RecoveryAction_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
