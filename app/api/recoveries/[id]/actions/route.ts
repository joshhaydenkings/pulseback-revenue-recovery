import { z } from 'zod';
import { invalidRequestResponse, safeErrorResponse } from '../../../../../lib/http/safe-response';
import { enforceRateLimit, publicMutationLimits } from '../../../../../lib/security/rate-limit';
import { getRecoveryRepository } from '../../../../../repositories/recovery-repository';

const schema = z.object({
  command: z.enum(['approve', 'reject', 'stop', 'run', 'escalate']),
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await enforceRateLimit(
    request,
    publicMutationLimits.recoveryAction,
  );
  if (limited) return limited;
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    return Response.json(
      await getRecoveryRepository().runCaseCommand(
        id,
        input.command,
        input.reason,
      ),
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequestResponse('Invalid recovery action request');
    }
    return safeErrorResponse(
      'recovery-action',
      error,
      'Unable to update this recovery case',
      409,
    );
  }
}
