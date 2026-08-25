import OpenAI from 'openai';
import { z } from 'zod';
import type { FailureCategory, RecoveryCase, RecoveryDecision } from '../../domain/recovery/types';

export const recoveryDecisionSchema = z.object({ diagnosis:z.string().min(5), failureCategory:z.enum(['AUTHENTICATION','INSUFFICIENT_FUNDS','BANK_NETWORK','CUSTOMER_ABANDONMENT','SUBSCRIPTION_FAILURE','UNKNOWN']), recommendedAction:z.enum(['OBSERVE','WAIT','CREATE_PAYMENT_LINK','SEND_REMINDER','RETRY_RECOMMENDATION','ESCALATE','STOP']), confidence:z.number().min(0).max(1), estimatedRecoveryProbability:z.number().min(0).max(1), merchantExplanation:z.string().min(10), supportingEvidence:z.array(z.string()), waitMinutes:z.number().positive().optional(), riskFlags:z.array(z.string()) });
export interface DecisionEngine { decide(recovery: Pick<RecoveryCase,'failureCategory'|'attempts'|'memory'|'amountPaise'|'riskFlags'|'paymentMethod'>): Promise<RecoveryDecision>; }

const recommendations: Record<FailureCategory, Pick<RecoveryDecision,'recommendedAction'|'diagnosis'|'estimatedRecoveryProbability'>> = {
  AUTHENTICATION:{recommendedAction:'CREATE_PAYMENT_LINK',diagnosis:'Customer authentication did not complete',estimatedRecoveryProbability:.78}, INSUFFICIENT_FUNDS:{recommendedAction:'WAIT',diagnosis:'Issuer reported insufficient available balance',estimatedRecoveryProbability:.54},
  BANK_NETWORK:{recommendedAction:'OBSERVE',diagnosis:'Bank or network timed out before a final authorization state',estimatedRecoveryProbability:.72}, CUSTOMER_ABANDONMENT:{recommendedAction:'SEND_REMINDER',diagnosis:'Checkout ended before payment authorization',estimatedRecoveryProbability:.63},
  SUBSCRIPTION_FAILURE:{recommendedAction:'SEND_REMINDER',diagnosis:'Recurring mandate could not complete',estimatedRecoveryProbability:.59}, UNKNOWN:{recommendedAction:'ESCALATE',diagnosis:'Provider evidence is insufficient for autonomous action',estimatedRecoveryProbability:.25}
};

export class MockDecisionEngine implements DecisionEngine {
  async decide(r: Pick<RecoveryCase,'failureCategory'|'attempts'|'memory'|'amountPaise'|'riskFlags'|'paymentMethod'>) {
    const base = recommendations[r.failureCategory];
    const stop = r.memory.contacts24h>=2 || r.memory.fatigueScore>=80;
    const repeated = r.attempts>=2;
    const recommendedAction = stop ? 'STOP' : repeated ? 'ESCALATE' : base.recommendedAction;
    return { ...base, failureCategory:r.failureCategory, recommendedAction, confidence:r.failureCategory==='UNKNOWN'?.48:.88, estimatedRecoveryProbability:Math.max(.08,base.estimatedRecoveryProbability-r.attempts*.06), merchantExplanation: stop ? 'Further contact would exceed the customer recovery-fatigue boundary.' : `${base.diagnosis}. The customer history, attempt count and ${r.paymentMethod.toLowerCase()} context make this ${base.estimatedRecoveryProbability>=.65?'a strong':'a measured'} recovery opportunity.`, supportingEvidence:[`${r.memory.successfulPayments} previous successful payments`,`${r.attempts} prior recovery attempts`,`${r.memory.contacts24h} contacts in the last 24 hours`], riskFlags:r.riskFlags, waitMinutes:base.recommendedAction==='OBSERVE'?12:base.recommendedAction==='WAIT'?120:undefined } satisfies RecoveryDecision;
  }
}

export class OpenAIDecisionEngine implements DecisionEngine {
  private client = new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  async decide(recovery: Pick<RecoveryCase,'failureCategory'|'attempts'|'memory'|'amountPaise'|'riskFlags'|'paymentMethod'>): Promise<RecoveryDecision> {
    const response = await this.client.responses.create({ model:process.env.OPENAI_MODEL||'gpt-5-mini', input:[{role:'system',content:'You diagnose failed payments. Return only concise merchant-facing recovery guidance as JSON. Never authorize or execute financial actions.'},{role:'user',content:JSON.stringify(recovery)}], text:{format:{type:'json_schema',name:'recovery_decision',strict:true,schema:{type:'object',additionalProperties:false,properties:{diagnosis:{type:'string'},failureCategory:{type:'string',enum:['AUTHENTICATION','INSUFFICIENT_FUNDS','BANK_NETWORK','CUSTOMER_ABANDONMENT','SUBSCRIPTION_FAILURE','UNKNOWN']},recommendedAction:{type:'string',enum:['OBSERVE','WAIT','CREATE_PAYMENT_LINK','SEND_REMINDER','RETRY_RECOMMENDATION','ESCALATE','STOP']},confidence:{type:'number'},estimatedRecoveryProbability:{type:'number'},merchantExplanation:{type:'string'},supportingEvidence:{type:'array',items:{type:'string'}},waitMinutes:{type:['number','null']},riskFlags:{type:'array',items:{type:'string'}}},required:['diagnosis','failureCategory','recommendedAction','confidence','estimatedRecoveryProbability','merchantExplanation','supportingEvidence','waitMinutes','riskFlags']}}} });
    return recoveryDecisionSchema.parse(JSON.parse(response.output_text));
  }
}

export async function decideWithFallback(recovery: Parameters<DecisionEngine['decide']>[0], primary?: DecisionEngine) { try { return {decision:await (primary??new MockDecisionEngine()).decide(recovery),fallback:false}; } catch { return {decision:await new MockDecisionEngine().decide(recovery),fallback:true}; } }
