import { z } from 'zod';
import { invalidRequestResponse, safeErrorResponse } from '../../../lib/http/safe-response';
import { enforceRateLimit, publicMutationLimits } from '../../../lib/security/rate-limit';
import { getRecoveryRepository } from '../../../repositories/recovery-repository';

const schema = z.object({
  operatingMode: z.enum(['SHADOW', 'APPROVAL', 'AUTOPILOT']),
  autonomousAmountThresholdPaise: z.number().int().min(0),
  observationWindowMinutes: z.number().int().min(1).max(1440),
  maxAttemptsPerCase: z.number().int().min(1).max(10),
  contactsPer24h: z.number().int().min(0).max(10),
  contactsPer7d: z.number().int().min(0).max(30),
  minimumConfidence: z.number().min(0).max(1),
  highRiskAutoStop: z.boolean(),
  newCustomerApprovalThresholdPaise: z.number().int().min(0),
  preventRepeatedAction: z.boolean(),
  fatigueStopThreshold: z.number().min(0).max(100),
});

export async function GET() {
  const repository = getRecoveryRepository();
  return Response.json({
    ...(await repository.getPolicies()),
    storage: repository.kind,
  });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(
    request,
    publicMutationLimits.policyMutation,
  );
  if (limited) return limited;
  try {
    const policies = schema.parse(await request.json());
    const repository = getRecoveryRepository();
    return Response.json({
      ok: true,
      policies: await repository.savePolicies(policies),
      persisted: repository.kind,
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequestResponse('Invalid Guardian policy configuration');
    }
    return safeErrorResponse(
      'guardian-policy',
      error,
      'Unable to save Guardian policies',
    );
  }
}
