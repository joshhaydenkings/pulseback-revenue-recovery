import { describe, expect, it } from 'vitest';
import { calculateOpportunityScore } from '../domain/recovery/opportunity-score';
import { evaluateGuardian } from '../domain/guardian/evaluate';
import { DEFAULT_POLICIES } from '../domain/recovery/types';
import { InvalidTransitionError, transitionRecovery } from '../domain/recovery/state-machine';
import { runEvaluation } from '../domain/evaluation/simulator';
import { verifyRazorpaySignature } from '../lib/razorpay/signature';
import { createHmac } from 'node:crypto';
import { claimWebhookEvent, resetWebhookEvents } from '../services/event-store';
import { executePaymentLink, handleLateAuthorization } from '../services/recovery-orchestrator';
import { MockPaymentProvider } from '../lib/razorpay/payment-provider';
import { decideWithFallback, type DecisionEngine } from '../lib/ai/decision-engine';
import { getDemoCase } from '../lib/demo-data';

describe('PulseBack domain safety',()=>{
  it('raises opportunity for stronger customer history and probability',()=>{const base={amountPaise:499900,failureCategory:'AUTHENTICATION' as const,attempts:0,hoursSinceFailure:1,riskFlags:[],likelySelfResolve:false,hasActiveLink:false};const low=calculateOpportunityScore({...base,predictedProbability:.3,memory:{successfulPayments:0,failedPayments:1,recoveryAttempts:0,contacts24h:0,contacts7d:0,previousRecoveries:0,fatigueScore:10}});const high=calculateOpportunityScore({...base,predictedProbability:.78,memory:{successfulPayments:5,failedPayments:1,recoveryAttempts:0,contacts24h:0,contacts7d:1,previousRecoveries:2,fatigueScore:10}});expect(high.score).toBeGreaterThan(low.score);expect(high.expectedRecoverableValuePaise).toBeGreaterThan(low.expectedRecoverableValuePaise);});
  it('requires approval above autonomous amount threshold',()=>{const c=getDemoCase('RC-1048');expect(evaluateGuardian(c,c.decision,DEFAULT_POLICIES).decision).toBe('APPROVAL_REQUIRED');});
  it('blocks excessive contact fatigue',()=>{const c={...getDemoCase('RC-1018'),amountPaise:49900};expect(evaluateGuardian(c,c.decision,DEFAULT_POLICIES).decision).toBe('BLOCKED');});
  it('verifies HMAC SHA-256 webhook signatures',()=>{const body='{"event":"payment.failed"}',secret='whsec_test',signature=createHmac('sha256',secret).update(body).digest('hex');expect(verifyRazorpaySignature(body,signature,secret)).toBe(true);expect(verifyRazorpaySignature(body,'0'.repeat(64),secret)).toBe(false);});
  it('claims webhook event ids only once',()=>{resetWebhookEvents();expect(claimWebhookEvent('evt_1')).toBe(true);expect(claimWebhookEvent('evt_1')).toBe(false);});
  it('late authorization cancels pending recovery',async()=>{const c=getDemoCase('RC-1042');const result=await handleLateAuthorization(c);expect(result.status).toBe('SELF_RECOVERED');expect(result.nextActionAt).toBeUndefined();expect(result.timeline.at(-1)?.description).toContain('cancelled');});
  it('prevents a duplicate active payment link',async()=>{const c={...getDemoCase('RC-1039'),activePaymentLinkId:'plink_existing'};const result=await executePaymentLink(c,new MockPaymentProvider());expect(result.created).toBe(false);expect(result.recovery.activePaymentLinkId).toBe('plink_existing');});
  it('uses deterministic fallback when the AI result fails',async()=>{const failing:DecisionEngine={decide:async()=>{throw new Error('invalid structured output')}};const c=getDemoCase('RC-1039');const result=await decideWithFallback(c,failing);expect(result.fallback).toBe(true);expect(result.decision.failureCategory).toBe('AUTHENTICATION');});
  it('rejects invalid state transitions',()=>{expect(()=>transitionRecovery('RECOVERED','ANALYZING')).toThrow(InvalidTransitionError);expect(transitionRecovery('PENDING_OBSERVATION','SELF_RECOVERED')).toBe('SELF_RECOVERED');});
  it('produces deterministic seeded Recovery Lab results',()=>{expect(runEvaluation('PULSEBACK-2026',200)).toEqual(runEvaluation('PULSEBACK-2026',200));expect(runEvaluation('DIFFERENT',200).pulseBack.recoveredPaise).not.toBe(runEvaluation('PULSEBACK-2026',200).pulseBack.recoveredPaise);});
  it('escalates safely when provider action fails',async()=>{const c={...getDemoCase('RC-1039'),status:'PLAN_READY' as const,activePaymentLinkId:undefined};const result=await executePaymentLink(c,new MockPaymentProvider(true));expect(result.created).toBe(false);expect(result.recovery.status).toBe('ESCALATED');expect(result.recovery.timeline.at(-1)?.description).toContain('No duplicate');});
});
