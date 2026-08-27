import { safeErrorResponse } from "../../../../../lib/http/safe-response";
import {
  enforceRateLimit,
  publicMutationLimits,
} from "../../../../../lib/security/rate-limit";
import { getRecoveryRepository } from "../../../../../repositories/recovery-repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const preview = await getRecoveryRepository().getRecoveryEmailPreview(id);
    return Response.json(preview, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return safeErrorResponse(
      "recovery-email-preview",
      error,
      "Unable to preview the recovery email",
      409,
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await enforceRateLimit(
    request,
    publicMutationLimits.recoveryEmail,
  );
  if (limited) return limited;
  try {
    const { id } = await params;
    const result = await getRecoveryRepository().sendRecoveryEmail(id);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return safeErrorResponse(
      "recovery-email-send",
      error,
      "Unable to send the recovery email",
      409,
    );
  }
}
