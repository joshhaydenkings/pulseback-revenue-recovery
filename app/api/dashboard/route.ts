import { getRecoveryRepository } from '../../../repositories/recovery-repository';
export async function GET(){const repository=getRecoveryRepository();return Response.json({...await repository.getDashboard(),storage:repository.kind});}
