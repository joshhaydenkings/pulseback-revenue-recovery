import { z } from "zod";
import { createRazorpayTestOrder } from "../../../../services/razorpay-order-service";
import { invalidRequestResponse, safeErrorResponse } from "../../../../lib/http/safe-response";
import { enforceRateLimit, publicMutationLimits } from "../../../../lib/security/rate-limit";
const schema = z.object({
  amountPaise: z.number().int().min(100).max(5_000_000),
  currency: z.literal("INR").default("INR"),
  customerId: z.string().max(100).optional(),
  scenario: z.string().max(100).optional(),
});
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, publicMutationLimits.razorpayOrder);
  if (limited) return limited;
  try {
    return Response.json(
      await createRazorpayTestOrder(schema.parse(await request.json())),
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequestResponse("Invalid Razorpay Test order request");
    }
    return safeErrorResponse(
      "razorpay-order",
      error,
      "Unable to create Razorpay Test order",
      503,
    );
  }
}
