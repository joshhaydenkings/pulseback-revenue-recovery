import { safeErrorResponse } from '../../../../lib/http/safe-response';
import { enforceRateLimit, publicMutationLimits } from '../../../../lib/security/rate-limit';
import { getRecoveryRepository } from '../../../../repositories/recovery-repository';

export async function POST(request: Request) {
  if (process.env.DEMO_MODE !== 'true') {
    return Response.json(
      { error: 'Demo controls are disabled.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const limited = await enforceRateLimit(
    request,
    publicMutationLimits.demoDueActions,
  );
  if (limited) return limited;
  try {
    const repository = getRecoveryRepository();
    return Response.json({
      ok: true,
      ...(await repository.processDueActions()),
      storage: repository.kind,
      simulatedControl: true,
    });
  } catch (error) {
    return safeErrorResponse(
      'demo-due-actions',
      error,
      'Unable to process due actions',
    );
  }
}
