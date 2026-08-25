import { databaseConfigured, getPrisma } from "../lib/db/prisma";
import { formatInrPaise } from "../lib/money";
import { getRazorpayConfiguration } from "../lib/razorpay/config";
import {
  MockPaymentProvider,
  RazorpayPaymentProvider,
} from "../lib/razorpay/payment-provider";

const merchantId = "merchant_demo";

export async function createRazorpayTestOrder(input: {
  amountPaise: number;
  customerId?: string;
  scenario?: string;
}) {
  const config = getRazorpayConfiguration();
  if (config.status === "invalid") throw new Error(config.reason);
  const receipt = `pb_${Date.now()}_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
  let customer: { id: string; name: string; email: string } | undefined;
  if (databaseConfigured()) {
    const prisma = await getPrisma();
    customer = input.customerId
      ? ((await prisma.customer.findFirst({
          where: { id: input.customerId, merchantId },
          select: { id: true, name: true, email: true },
        })) ?? undefined)
      : ((await prisma.customer.findFirst({
          where: { merchantId },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, email: true },
        })) ?? undefined);
    if (input.customerId && !customer) throw new Error("Unknown demo customer");
  }
  const provider =
    config.status === "connected"
      ? new RazorpayPaymentProvider(config.keyId!, config.keySecret!)
      : new MockPaymentProvider();
  const order = await provider.createOrder({
    amountPaise: input.amountPaise,
    receipt,
    notes: {
      pulseback_merchant_id: merchantId,
      pulseback_customer_id: customer?.id ?? "demo_customer",
      pulseback_scenario: input.scenario ?? "checkout",
    },
  });
  if (databaseConfigured()) {
    const prisma = await getPrisma();
    await prisma.$transaction([
      prisma.providerOrder.create({
        data: {
          id: crypto.randomUUID(),
          merchantId,
          customerId: customer?.id,
          provider: provider.kind === "razorpay-test" ? "RAZORPAY" : "MOCK",
          providerOrderId: order.id,
          amount: order.amountPaise,
          currency: order.currency,
          receipt,
          status: order.status,
          notes: {
            scenario: input.scenario ?? "checkout",
            testMode: provider.kind === "razorpay-test",
          },
        },
      }),
      prisma.auditEvent.create({
        data: {
          id: crypto.randomUUID(),
          merchantId,
          category: "RAZORPAY",
          eventType: "RAZORPAY_TEST_ORDER_CREATED",
          actor: "MERCHANT",
          message: `${provider.kind === "razorpay-test" ? "Razorpay Test" : "Demo"} Order created for ${formatInrPaise(order.amountPaise)}.`,
          metadata: {
            providerOrderId: order.id,
            receipt,
            simulated: provider.kind !== "razorpay-test",
          },
        },
      }),
    ]);
  }
  return {
    id: order.id,
    amount: order.amountPaise,
    currency: order.currency,
    receipt,
    status: order.status,
    keyId: config.status === "connected" ? config.publicKeyId : null,
    simulated: provider.kind !== "razorpay-test",
    customer: customer
      ? { id: customer.id, name: customer.name, email: customer.email }
      : undefined,
  };
}

export async function findRecoveryCaseForOrder(providerOrderId: string) {
  if (!databaseConfigured()) return undefined;
  const prisma = await getPrisma();
  const payment = await prisma.payment.findFirst({
    where: { provider: "RAZORPAY", providerOrderId },
    select: { recoveryCase: { select: { id: true, status: true } } },
  });
  return payment?.recoveryCase ?? undefined;
}
