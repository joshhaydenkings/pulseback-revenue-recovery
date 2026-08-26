import { z } from 'zod';
import { runEvaluation } from '../../../domain/evaluation/simulator';
import { invalidRequestResponse, safeErrorResponse } from '../../../lib/http/safe-response';
import { enforceRateLimit, publicMutationLimits } from '../../../lib/security/rate-limit';
import { getRecoveryRepository } from '../../../repositories/recovery-repository';

const schema = z.object({
  seed: z.string().min(1).max(64),
  caseCount: z.number().int().min(50).max(500),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, publicMutationLimits.evaluation);
  if (limited) return limited;
  try {
    const body = schema.parse(await request.json());
    const result = runEvaluation(body.seed, body.caseCount);
    const run = await getRecoveryRepository().saveEvaluation(result);
    return Response.json({ ...result, evaluationRunId: run.id });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequestResponse('Invalid evaluation configuration');
    }
    return safeErrorResponse(
      'recovery-lab',
      error,
      'Unable to save this evaluation run',
    );
  }
}
