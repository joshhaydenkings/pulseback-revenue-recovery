import { z } from 'zod';
import { getRecoveryRepository } from '../../../../../repositories/recovery-repository';

const schema=z.object({command:z.enum(['approve','reject','stop','run','escalate']),reason:z.string().max(500).optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const{id}=await params;const input=schema.parse(await request.json());return Response.json(await getRecoveryRepository().runCaseCommand(id,input.command,input.reason));}catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to update recovery case'},{status:400});}}
