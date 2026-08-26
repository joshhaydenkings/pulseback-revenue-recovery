import { createHash } from "node:crypto";
import { adaptRazorpayEvent } from "../../../../lib/razorpay/event-adapter";
import { verifyRazorpaySignature } from "../../../../lib/razorpay/signature";
import { safeErrorResponse } from "../../../../lib/http/safe-response";
import { processRecoveryEvent } from "../../../../services/recovery-event-pipeline";
import {
  recordRazorpayAudit,
  requireRazorpayTestConfiguration,
} from "../../../../services/razorpay-integration-service";
export async function POST(request: Request) {
  const rawBody = await request.text();
  let config;
  try {
    config = requireRazorpayTestConfiguration({ webhook: true });
  } catch (error) {
    return safeErrorResponse(
      "razorpay-webhook-configuration",
      error,
      "Razorpay Test webhook is unavailable",
      503,
    );
  }
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyRazorpaySignature(rawBody, signature, config.webhookSecret!)) {
    try {
      await recordRazorpayAudit(
        "INVALID_WEBHOOK_SIGNATURE_REJECTED",
        "Invalid Razorpay webhook signature rejected.",
        {
          bodyDigest: createHash("sha256")
            .update(rawBody)
            .digest("hex")
            .slice(0, 16),
        },
      );
    } catch (error) {
      console.error('[PulseBack:webhook-rejection-audit]', {
        name: error instanceof Error ? error.name : typeof error,
      });
    }
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const providerEventId =
    request.headers.get("x-razorpay-event-id") ||
    `body_${createHash("sha256").update(rawBody).digest("hex")}`;
  let normalized;
  try {
    normalized = adaptRazorpayEvent(payload, providerEventId);
  } catch {
    return Response.json(
      { error: "Invalid Razorpay event payload" },
      { status: 400 },
    );
  }
  if (!normalized) return Response.json({ ok: true, ignored: true });
  try {
    const result = await processRecoveryEvent(normalized);
    return Response.json({
      ...result,
      event: (payload as { event?: string }).event,
      processed: !result.duplicate,
    });
  } catch (error) {
    return safeErrorResponse(
      'razorpay-webhook-processing',
      error,
      'Webhook could not be processed',
    );
  }
}
