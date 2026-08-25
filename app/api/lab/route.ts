import { z } from 'zod';
import { runEvaluation } from '../../../domain/evaluation/simulator';
const schema=z.object({seed:z.string().min(1).max(64),caseCount:z.number().int().min(50).max(500)});
export async function POST(request:Request){try{const body=schema.parse(await request.json());return Response.json(runEvaluation(body.seed,body.caseCount));}catch(error){return Response.json({error:'Invalid evaluation configuration',details:error instanceof z.ZodError?error.issues:undefined},{status:400});}}
