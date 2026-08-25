import { z } from 'zod';
import { DEFAULT_POLICIES } from '../../../domain/recovery/types';
let policies={...DEFAULT_POLICIES};
const schema=z.object({operatingMode:z.enum(['SHADOW','APPROVAL','AUTOPILOT']),autonomousAmountThresholdPaise:z.number().int().min(0),observationWindowMinutes:z.number().int().min(1).max(1440),maxAttemptsPerCase:z.number().int().min(1).max(10),contactsPer24h:z.number().int().min(0).max(10),contactsPer7d:z.number().int().min(0).max(30),minimumConfidence:z.number().min(0).max(1),highRiskAutoStop:z.boolean(),newCustomerApprovalThresholdPaise:z.number().int().min(0),preventRepeatedAction:z.boolean(),fatigueStopThreshold:z.number().min(0).max(100)});
export async function GET(){return Response.json(policies)}
export async function POST(request:Request){try{policies=schema.parse(await request.json());return Response.json({ok:true,policies,persisted:'demo-session'});}catch{return Response.json({error:'Invalid Guardian policy configuration'},{status:400});}}
