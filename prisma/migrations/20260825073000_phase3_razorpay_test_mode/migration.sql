-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "failureSource" TEXT,
ADD COLUMN     "failureStep" TEXT,
ADD COLUMN     "provenance" TEXT NOT NULL DEFAULT 'PULSEBACK_DEMO',
ADD COLUMN     "providerMetadata" JSONB;

-- AlterTable
ALTER TABLE "RecoveryAction" ADD COLUMN     "providerExpiresAt" TIMESTAMP(3),
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "providerUrl" TEXT;

-- CreateTable
CREATE TABLE "ProviderOrder" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT,
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "receipt" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" JSONB,
    "verifiedPaymentId" TEXT,
    "checkoutVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderOrder_merchantId_createdAt_idx" ON "ProviderOrder"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderOrder_provider_providerOrderId_key" ON "ProviderOrder"("provider", "providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderOrder_provider_receipt_key" ON "ProviderOrder"("provider", "receipt");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryAction_providerReference_key" ON "RecoveryAction"("providerReference");

-- AddForeignKey
ALTER TABLE "ProviderOrder" ADD CONSTRAINT "ProviderOrder_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderOrder" ADD CONSTRAINT "ProviderOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
