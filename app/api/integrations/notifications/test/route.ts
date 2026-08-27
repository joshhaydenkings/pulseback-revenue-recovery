import { safeErrorResponse } from "../../../../../lib/http/safe-response";
import {
  enforceRateLimit,
  publicMutationLimits,
} from "../../../../../lib/security/rate-limit";
import { sendConfiguredTestEmail } from "../../../../../services/notification-integration-service";

export async function POST(request: Request) {
  const limited = await enforceRateLimit(
    request,
    publicMutationLimits.notificationTest,
  );
  if (limited) return limited;
  try {
    return Response.json(await sendConfiguredTestEmail(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return safeErrorResponse(
      "notification-test",
      error,
      "Unable to send the notification test",
      409,
    );
  }
}
