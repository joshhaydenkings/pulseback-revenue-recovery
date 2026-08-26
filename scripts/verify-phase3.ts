import assert from "node:assert/strict";
import { getPrisma } from "../lib/db/prisma";
import { getRecoveryRepository } from "../repositories/recovery-repository";

if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL is required for Phase 3 persistence verification",
  );
const repository = getRecoveryRepository();
assert.equal(repository.kind, "postgresql");

// Keep this persistence/provider verification deterministic and credit-free.
// Live Groq is verified separately through the dedicated AI endpoint.
process.env.GROQ_API_KEY = "";

const token = process.env.PHASE3_VERIFY_TOKEN ?? `phase3_${Date.now()}`;
const originalPaymentId = `pay_test_failure_${token}`;
const recoveryPaymentId = `pay_test_recovery_${token}`;
const failureEventId = `evt_test_failure_${token}`;
const paidEventId = `evt_test_paid_${token}`;
const amountPaise = 499_900;
const before = await repository.getDashboard();

const failed = await repository.processEvent({
  provider: "RAZORPAY",
  providerEventId: failureEventId,
  providerPaymentId: originalPaymentId,
  type: "authentication_failure",
  amountPaise,
  failureCode: "BAD_REQUEST_ERROR",
  failureDescription: "Razorpay Test verification failure.",
  providerMetadata: {
    errorSource: "bank",
    errorStep: "payment_authentication",
    verification: true,
  },
});
assert.equal(failed.duplicate, false);
assert.ok(failed.caseId);
const caseId = failed.caseId;
const failedCase = await repository.getCase(caseId);
assert.ok(failedCase);
assert.equal(failedCase.provenance, "RAZORPAY_TEST");
assert.equal(
  (await repository.getDashboard()).revenueAtRiskPaise,
  before.revenueAtRiskPaise + amountPaise,
);

if (failedCase.status === "AWAITING_APPROVAL")
  await repository.runCaseCommand(caseId, "approve");
const linkResult = await repository.runCaseCommand(caseId, "run");
assert.ok(linkResult.paymentLinkUrl);
assert.ok(linkResult.case.activePaymentLinkId);
const linkId = linkResult.case.activePaymentLinkId;
const referenceId = `pulseback_recovery_${caseId}`;
const prisma = await getPrisma();
assert.equal(
  await prisma.recoveryAction.count({
    where: { recoveryCaseId: caseId, type: "CREATE_PAYMENT_LINK" },
  }),
  1,
);

const paid = await repository.processEvent({
  provider: "RAZORPAY",
  providerEventId: paidEventId,
  type: "payment_link_paid",
  caseId,
  providerPaymentId: recoveryPaymentId,
  providerLinkId: linkId,
  providerLinkReference: referenceId,
  amountPaise,
});
assert.equal(paid.duplicate, false);
const recoveredCase = await repository.getCase(caseId);
assert.ok(recoveredCase);
assert.equal(recoveredCase.status, "RECOVERED");
const recoveredAfterFirst = (await repository.getDashboard())
  .revenueRecoveredPaise;

const duplicate = await repository.processEvent({
  provider: "RAZORPAY",
  providerEventId: paidEventId,
  type: "payment_link_paid",
  caseId,
  providerPaymentId: recoveryPaymentId,
  providerLinkId: linkId,
  providerLinkReference: referenceId,
  amountPaise,
});
assert.equal(duplicate.duplicate, true);
assert.equal(
  (await repository.getDashboard()).revenueRecoveredPaise,
  recoveredAfterFirst,
);
assert.equal(
  await prisma.payment.count({
    where: { provider: "RAZORPAY", providerPaymentId: recoveryPaymentId },
  }),
  1,
);
assert.equal(
  await prisma.recoveryAction.count({
    where: { recoveryCaseId: caseId, type: "CREATE_PAYMENT_LINK" },
  }),
  1,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      storage: repository.kind,
      caseId,
      provenance: "RAZORPAY_TEST",
      activePaymentLinkId: linkId,
      duplicateIgnored: duplicate.duplicate,
      recoveredExactlyOncePaise: amountPaise,
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
