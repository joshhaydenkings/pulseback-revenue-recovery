import assert from 'node:assert/strict';
import { getPrisma } from '../lib/db/prisma';
import { getRecoveryRepository } from '../repositories/recovery-repository';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for Phase 2 verification');
const repository = getRecoveryRepository();
assert.equal(repository.kind, 'postgresql');

const token = process.env.PHASE2_VERIFY_TOKEN ?? `phase2_${Date.now()}`;
const providerEventId = `${token}_failed`;
const providerPaymentId = `pay_${token}`;
const before = await repository.getDashboard();
const failed = await repository.processEvent({ provider: 'SIMULATOR', providerEventId, providerPaymentId, type: 'authentication_failure', amountPaise: 499_900 });
assert.equal(failed.duplicate, false);
assert.ok(failed.caseId);
assert.equal((await repository.getDashboard()).revenueAtRiskPaise, before.revenueAtRiskPaise + 499_900);
assert.ok((await repository.listAuditEvents()).some(event => event.caseId === failed.caseId));

const prisma = await getPrisma();
assert.equal(await prisma.payment.count({ where: { provider: 'SIMULATOR', providerPaymentId } }), 1);
assert.equal(await prisma.recoveryCase.count({ where: { id: failed.caseId } }), 1);
assert.equal(await prisma.recoveryAction.count({ where: { recoveryCaseId: failed.caseId } }), 1);

if ((await repository.getCase(failed.caseId!))?.status === 'AWAITING_APPROVAL') {
  await repository.runCaseCommand(failed.caseId!, 'approve');
}
const due = await repository.processDueActions(
  new Date(Date.now() + 24 * 60 * 60 * 1_000),
);
assert.ok(due.processed >= 1);
assert.equal((await repository.getCase(failed.caseId!))?.status, 'RECOVERING');
const actionCountBeforeDuplicate = await prisma.recoveryAction.count({ where: { recoveryCaseId: failed.caseId } });

const paidEventId = `${token}_paid`;
const paid = await repository.processEvent({ provider: 'SIMULATOR', providerEventId: paidEventId, providerPaymentId, caseId: failed.caseId, type: 'payment_link_paid' });
assert.equal(paid.duplicate, false);
assert.equal((await repository.getCase(failed.caseId!))?.status, 'RECOVERED');
assert.ok((await repository.getDashboard()).revenueRecoveredPaise >= before.revenueRecoveredPaise + 499_900);
const duplicate = await repository.processEvent({ provider: 'SIMULATOR', providerEventId: paidEventId, providerPaymentId, caseId: failed.caseId, type: 'payment_link_paid' });
assert.equal(duplicate.duplicate, true);
assert.equal(await prisma.recoveryAction.count({ where: { recoveryCaseId: failed.caseId } }), actionCountBeforeDuplicate);

const originalPolicies = await repository.getPolicies();
await repository.savePolicies({ ...originalPolicies, operatingMode: 'APPROVAL', observationWindowMinutes: originalPolicies.observationWindowMinutes + 1 }, 'PHASE2_VERIFY');
const persistedPolicies = await repository.getPolicies();
assert.equal(persistedPolicies.operatingMode, 'APPROVAL');
assert.equal(persistedPolicies.observationWindowMinutes, originalPolicies.observationWindowMinutes + 1);
await repository.savePolicies(originalPolicies, 'PHASE2_VERIFY');

console.log(JSON.stringify({ ok: true, caseId: failed.caseId, providerEventId, paidEventId, due, beforeAtRiskPaise: before.revenueAtRiskPaise, afterRecoveredPaise: (await repository.getDashboard()).revenueRecoveredPaise }, null, 2));
await prisma.$disconnect();
