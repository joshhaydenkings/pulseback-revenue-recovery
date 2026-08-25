import type { GuardianPolicies, RecoveryCase, RecoveryDecision } from '../recovery/types';

export interface GuardianResult { decision: 'APPROVED'|'APPROVAL_REQUIRED'|'BLOCKED'; reasons: string[]; rules: { label:string; passed:boolean }[]; }
export function evaluateGuardian(recovery: Pick<RecoveryCase,'amountPaise'|'attempts'|'riskFlags'|'memory'|'activePaymentLinkId'|'operatingMode'>, ai: RecoveryDecision, policies: GuardianPolicies): GuardianResult {
  const rules = [
    {label:`Amount below ₹${Math.round(policies.autonomousAmountThresholdPaise/100).toLocaleString('en-IN')} autonomous threshold`,passed:recovery.amountPaise<=policies.autonomousAmountThresholdPaise},
    {label:'Contact limit not exceeded',passed:recovery.memory.contacts24h<policies.contactsPer24h && recovery.memory.contacts7d<policies.contactsPer7d},
    {label:'No high-risk flag',passed:recovery.riskFlags.length===0}, {label:'Attempt limit available',passed:recovery.attempts<policies.maxAttemptsPerCase},
    {label:'No duplicate active Payment Link',passed:!(ai.recommendedAction==='CREATE_PAYMENT_LINK' && recovery.activePaymentLinkId)}, {label:'AI confidence meets autonomous minimum',passed:ai.confidence>=policies.minimumConfidence}
  ];
  const reasons = rules.filter(r=>!r.passed).map(r=>r.label);
  if ((policies.highRiskAutoStop && recovery.riskFlags.length) || recovery.memory.fatigueScore>=policies.fatigueStopThreshold || recovery.attempts>=policies.maxAttemptsPerCase || (ai.recommendedAction==='CREATE_PAYMENT_LINK' && recovery.activePaymentLinkId)) return {decision:'BLOCKED',reasons,rules};
  if (policies.operatingMode==='SHADOW' || recovery.amountPaise>policies.autonomousAmountThresholdPaise || ai.confidence<policies.minimumConfidence || (recovery.memory.successfulPayments===0 && recovery.amountPaise>policies.newCustomerApprovalThresholdPaise)) return {decision:'APPROVAL_REQUIRED',reasons: reasons.length?reasons:['Shadow Mode prohibits customer-facing actions'],rules};
  return {decision:'APPROVED',reasons:['All Guardian policies passed'],rules};
}
