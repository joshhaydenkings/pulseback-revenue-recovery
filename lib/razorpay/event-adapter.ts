import { z } from "zod";
import type {
  RecoveryEventInput,
  SimulatorEventType,
} from "../../repositories/types";

const entitySchema = z
  .object({
    id: z.string().optional(),
    order_id: z.string().nullable().optional(),
    amount: z.number().int().optional(),
    amount_paid: z.number().int().optional(),
    currency: z.string().optional(),
    method: z.string().optional(),
    email: z.string().optional(),
    contact: z.string().optional(),
    status: z.string().optional(),
    reference_id: z.string().optional(),
    short_url: z.string().url().optional(),
    expire_by: z.number().int().optional(),
    error_code: z.string().optional(),
    error_description: z.string().optional(),
    error_source: z.string().optional(),
    error_step: z.string().optional(),
    error_reason: z.string().optional(),
  })
  .passthrough();
const webhookSchema = z
  .object({
    event: z.string(),
    created_at: z.number().int().optional(),
    payload: z
      .object({
        payment: z.object({ entity: entitySchema }).optional(),
        payment_link: z.object({ entity: entitySchema }).optional(),
        order: z.object({ entity: entitySchema }).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type RazorpayWebhookPayload = z.infer<typeof webhookSchema>;

export function mapRazorpayFailure(fields: {
  error_code?: string;
  error_description?: string;
  error_reason?: string;
  error_source?: string;
  error_step?: string;
}) {
  const evidence = [
    fields.error_code,
    fields.error_description,
    fields.error_reason,
    fields.error_source,
    fields.error_step,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const type: SimulatorEventType = /fund|balance/.test(evidence)
    ? "insufficient_funds"
    : /timeout|network|gateway/.test(evidence)
      ? "bank_timeout"
      : "authentication_failure";
  return {
    type,
    description:
      fields.error_description ??
      fields.error_reason ??
      "Razorpay reported a failed Test Mode payment.",
  };
}

export function recoveryCaseIdFromReference(referenceId?: string) {
  const prefix = "pulseback_recovery_";
  return referenceId?.startsWith(prefix)
    ? referenceId.slice(prefix.length)
    : undefined;
}

export function adaptRazorpayEvent(
  payloadValue: unknown,
  providerEventId: string,
): RecoveryEventInput | undefined {
  const payload = webhookSchema.parse(payloadValue);
  const payment = payload.payload.payment?.entity;
  const link = payload.payload.payment_link?.entity;
  const order = payload.payload.order?.entity;
  let type: SimulatorEventType | undefined;
  if (payload.event === "payment.failed")
    type = mapRazorpayFailure(payment ?? {}).type;
  if (payload.event === "payment.authorized") type = "late_authorization";
  if (payload.event === "payment.captured") type = "payment_captured";
  if (payload.event === "payment_link.paid") type = "payment_link_paid";
  if (payload.event === "payment_link.expired") type = "payment_link_expired";
  if (payload.event === "payment_link.cancelled")
    type = "payment_link_cancelled";
  if (!type) return undefined;
  const failure = mapRazorpayFailure(payment ?? {});
  const referenceId = link?.reference_id;
  return {
    provider: "RAZORPAY",
    providerEventId,
    type,
    providerPaymentId: payment?.id,
    providerOrderId: payment?.order_id ?? order?.id,
    providerLinkId: link?.id,
    providerLinkReference: referenceId,
    providerLinkUrl: link?.short_url,
    providerStatus: link?.status ?? payment?.status,
    caseId: recoveryCaseIdFromReference(referenceId),
    amountPaise: payload.event.startsWith("payment_link.")
      ? link?.amount_paid || payment?.amount || link?.amount
      : payment?.amount,
    customerEmail: payment?.email,
    paymentMethod: payment?.method,
    failureCode: payment?.error_code,
    failureDescription: failure.description,
    providerMetadata: {
      razorpayEvent: payload.event,
      errorSource: payment?.error_source,
      errorStep: payment?.error_step,
      errorReason: payment?.error_reason,
      linkStatus: link?.status,
    },
    occurredAt: payload.created_at
      ? new Date(payload.created_at * 1000).toISOString()
      : undefined,
    payload: payload as unknown as Record<string, unknown>,
  };
}
