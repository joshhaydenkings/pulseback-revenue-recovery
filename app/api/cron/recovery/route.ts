import { getRecoveryRepository } from '../../../../repositories/recovery-repository';
export async function POST(request:Request){const secret=process.env.CRON_SECRET;if(secret&&request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized'},{status:401});const repository=getRecoveryRepository();return Response.json({ok:true,...await repository.processDueActions(),storage:repository.kind});}
export const GET=POST;
