import { getRecoveryRepository } from "../../../../../repositories/recovery-repository";
import { safeErrorResponse } from "../../../../../lib/http/safe-response";
import { enforceRateLimit, publicMutationLimits } from "../../../../../lib/security/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await enforceRateLimit(
    request,
    publicMutationLimits.recoveryReanalysis,
  );
  if (limited) return limited;
  try {
    const { id } = await params;
    return Response.json(await getRecoveryRepository().reanalyzeCase(id));
  } catch (error) {
    return safeErrorResponse(
      "recovery-reanalysis",
      error,
      "Unable to re-analyze this recovery case",
    );
  }
}
