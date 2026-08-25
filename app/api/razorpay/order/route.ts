import { z } from "zod";
import { createRazorpayTestOrder } from "../../../../services/razorpay-order-service";
const schema = z.object({
  amountPaise: z.number().int().min(100).max(5_000_000),
  currency: z.literal("INR").default("INR"),
  customerId: z.string().max(100).optional(),
  scenario: z.string().max(100).optional(),
});
export async function POST(request: Request) {
  try {
    return Response.json(
      await createRazorpayTestOrder(schema.parse(await request.json())),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create Test Mode order",
      },
      { status: 400 },
    );
  }
}
