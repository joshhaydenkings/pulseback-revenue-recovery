import { z } from "zod";
import { databaseConfigured, getPrisma } from "../../../../lib/db/prisma";
import { verifyCheckoutSignature } from "../../../../lib/razorpay/signature";
import { invalidRequestResponse, safeErrorResponse } from "../../../../lib/http/safe-response";
import { enforceRateLimit, publicMutationLimits } from "../../../../lib/security/rate-limit";
import {
  recordRazorpayAudit,
  requireRazorpayTestConfiguration,
} from "../../../../services/razorpay-integration-service";
const schema = z.object({
  orderId: z.string().min(1).max(100),
  paymentId: z.string().min(1).max(100),
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
});
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, publicMutationLimits.razorpayVerify);
  if (limited) return limited;
  try {
    const input = schema.parse(await request.json());
    const config = requireRazorpayTestConfiguration();
    if (
      !verifyCheckoutSignature(
        input.orderId,
        input.paymentId,
        input.signature,
        config.keySecret!,
      )
    ) {
      await recordRazorpayAudit(
        "CHECKOUT_SIGNATURE_REJECTED",
        "Invalid Razorpay Checkout signature rejected.",
        { providerOrderId: input.orderId },
      );
      return Response.json(
        { verified: false, error: "Checkout signature verification failed" },
        { status: 401 },
      );
    }
    if (databaseConfigured()) {
      const prisma = await getPrisma();
      const order = await prisma.providerOrder.findUnique({
        where: {
          provider_providerOrderId: {
            provider: "RAZORPAY",
            providerOrderId: input.orderId,
          },
        },
      });
      if (!order)
        return Response.json(
          { verified: false, error: "Unknown Razorpay Test order" },
          { status: 404 },
        );
      await prisma.$transaction([
        prisma.providerOrder.update({
          where: { id: order.id },
          data: {
            status: "checkout_verified",
            verifiedPaymentId: input.paymentId,
            checkoutVerifiedAt: new Date(),
          },
        }),
        prisma.auditEvent.create({
          data: {
            id: crypto.randomUUID(),
            merchantId: order.merchantId,
            category: "RAZORPAY",
            eventType: "CHECKOUT_SIGNATURE_VERIFIED",
            actor: "RAZORPAY",
            message:
              "Razorpay Test Checkout signature verified. Waiting for the authoritative webhook.",
            metadata: {
              providerOrderId: input.orderId,
              providerPaymentId: input.paymentId,
            },
          },
        }),
      ]);
    }
    return Response.json({
      verified: true,
      authoritativeState: "webhook_pending",
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequestResponse("Invalid checkout verification payload");
    }
    return safeErrorResponse(
      "razorpay-checkout-verification",
      error,
      "Unable to verify Razorpay Test Checkout",
    );
  }
}
