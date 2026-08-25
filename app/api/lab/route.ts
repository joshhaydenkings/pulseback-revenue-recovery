import { z } from 'zod';
import { runEvaluation } from '../../../domain/evaluation/simulator';
import { getRecoveryRepository } from '../../../repositories/recovery-repository';
const schema=z.object({seed:z.string().min(1).max(64),caseCount:z.number().int().min(50).max(500)});
export async function POST(request:Request){try{const body=schema.parse(await request.json());const result=runEvaluation(body.seed,body.caseCount);const run=await getRecoveryRepository().saveEvaluation(result);return Response.json({...result,evaluationRunId:run.id});}catch(error){return Response.json({error:'Invalid evaluation configuration',details:error instanceof z.ZodError?error.issues:undefined},{status:400});}}
