import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  getRazorpayConfiguration,
  publicRazorpayConfiguration,
} from "../lib/razorpay/config";
import {
  adaptRazorpayEvent,
  recoveryCaseIdFromReference,
} from "../lib/razorpay/event-adapter";
import {
  RazorpayPaymentProvider,
  RazorpayProviderError,
} from "../lib/razorpay/payment-provider";
import {
  verifyCheckoutSignature,
  verifyRazorpaySignature,
} from "../lib/razorpay/signature";
import { MemoryRecoveryRepository } from "../repositories/memory-recovery-repository";

describe("Razorpay Test Mode security and adapters", () => {
  it("accepts valid webhook and Checkout signatures and rejects tampering", () => {
    const secret = "test_secret";
    const body = JSON.stringify({ event: "payment.failed" });
    const webhookSignature = createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    const checkoutSignature = createHmac("sha256", secret)
      .update("order_test|pay_test")
      .digest("hex");
    expect(verifyRazorpaySignature(body, webhookSignature, secret)).toBe(true);
    expect(verifyRazorpaySignature(`${body} `, webhookSignature, secret)).toBe(
      false,
    );
    expect(
      verifyCheckoutSignature(
        "order_test",
        "pay_test",
        checkoutSignature,
        secret,
      ),
    ).toBe(true);
    expect(
      verifyCheckoutSignature(
        "order_other",
        "pay_test",
        checkoutSignature,
        secret,
      ),
    ).toBe(false);
  });

  it("maps a failed Razorpay payment without discarding provider evidence", () => {
    const event = adaptRazorpayEvent(
      {
        event: "payment.failed",
        created_at: 1_777_000_000,
        payload: {
          payment: {
            entity: {
              id: "pay_failed",
              order_id: "order_1",
              amount: 499_900,
              currency: "INR",
              method: "card",
              email: "judge@example.com",
              error_code: "BAD_REQUEST_ERROR",
              error_description: "Payment authentication failed",
              error_source: "bank",
              error_step: "payment_authentication",
              error_reason: "payment_authentication_failed",
            },
          },
        },
      },
      "evt_failed",
    );
    expect(event).toMatchObject({
      provider: "RAZORPAY",
      providerEventId: "evt_failed",
      type: "authentication_failure",
      providerPaymentId: "pay_failed",
      providerOrderId: "order_1",
      amountPaise: 499_900,
      failureCode: "BAD_REQUEST_ERROR",
    });
    expect(event?.providerMetadata).toMatchObject({
      razorpayEvent: "payment.failed",
      errorSource: "bank",
      errorStep: "payment_authentication",
    });
  });

  it("maps Payment Link terminal events to the referenced recovery case", () => {
    const event = adaptRazorpayEvent(
      {
        event: "payment_link.paid",
        payload: {
          payment: { entity: { id: "pay_recovery", amount: 499_900 } },
          payment_link: {
            entity: {
              id: "plink_test",
              amount: 499_900,
              amount_paid: 499_900,
              status: "paid",
              reference_id: "pulseback_recovery_RC-2001",
              short_url: "https://rzp.io/i/test",
            },
          },
        },
      },
      "evt_paid",
    );
    expect(event).toMatchObject({
      type: "payment_link_paid",
      caseId: "RC-2001",
      providerLinkId: "plink_test",
      providerLinkReference: "pulseback_recovery_RC-2001",
      amountPaise: 499_900,
    });
    expect(recoveryCaseIdFromReference("unrelated_reference")).toBeUndefined();
  });

  it("blocks live credentials and never returns secrets in public status", () => {
    const live = getRazorpayConfiguration({
      RAZORPAY_KEY_ID: "rzp_live_forbidden",
      NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_live_forbidden",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "webhook",
    });
    expect(live.status).toBe("invalid");
    expect(live.reason).toContain("Test Mode");
    const safe = publicRazorpayConfiguration({
      RAZORPAY_KEY_ID: "rzp_test_1234567890",
      NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_1234567890",
      RAZORPAY_KEY_SECRET: "server_secret",
      RAZORPAY_WEBHOOK_SECRET: "webhook_secret",
    });
    expect(safe.status).toBe("connected");
    expect(JSON.stringify(safe)).not.toContain("server_secret");
    expect(JSON.stringify(safe)).not.toContain("webhook_secret");
  });

  it("maps Razorpay API orders and links while keeping authentication server-side", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      if (path.endsWith("/orders"))
        return new Response(
          JSON.stringify({
            id: "order_test_1",
            amount: 499_900,
            currency: "INR",
            status: "created",
            receipt: "receipt_1",
          }),
          { status: 200 },
        );
      return new Response(
        JSON.stringify({
          id: "plink_test_1",
          short_url: "https://rzp.io/i/test-link",
          status: "created",
          amount: 499_900,
          reference_id: "pulseback_recovery_RC-2001",
          expire_by: 1_777_100_000,
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const provider = new RazorpayPaymentProvider(
      "rzp_test_1234567890",
      "server_secret",
      fetcher,
    );
    const order = await provider.createOrder({
      amountPaise: 499_900,
      receipt: "receipt_1",
    });
    const link = await provider.createPaymentLink({
      amountPaise: 499_900,
      referenceId: "pulseback_recovery_RC-2001",
      customer: { name: "Judge", email: "judge@example.com" },
    });
    expect(order.id).toBe("order_test_1");
    expect(link).toMatchObject({
      id: "plink_test_1",
      amountPaise: 499_900,
      referenceId: "pulseback_recovery_RC-2001",
    });
    const [, orderInit] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect((orderInit as RequestInit).headers).toMatchObject({
      Authorization: expect.stringMatching(/^Basic /),
    });
    expect(JSON.parse(String((orderInit as RequestInit).body))).toMatchObject({
      amount: 499_900,
      currency: "INR",
    });
  });

  it("maps provider errors and refuses a live provider client", async () => {
    expect(
      () => new RazorpayPaymentProvider("rzp_live_forbidden", "secret"),
    ).toThrow(RazorpayProviderError);
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "BAD_REQUEST_ERROR",
              description: "reference_id already exists",
            },
          }),
          { status: 400 },
        ),
    ) as unknown as typeof fetch;
    const provider = new RazorpayPaymentProvider(
      "rzp_test_1234567890",
      "server_secret",
      fetcher,
    );
    await expect(
      provider.createPaymentLink({
        amountPaise: 100,
        referenceId: "duplicate",
        customer: { name: "Judge", email: "judge@example.com" },
      }),
    ).rejects.toMatchObject({ status: 400, code: "BAD_REQUEST_ERROR" });
  });
});

describe("Razorpay recovery semantics", () => {
  it("records a paid recovery exactly once and rejects amount mismatches", async () => {
    const repository = new MemoryRecoveryRepository();
    const created = await repository.processEvent({
      provider: "RAZORPAY",
      providerEventId: "evt_failure_once",
      type: "authentication_failure",
      providerPaymentId: "pay_failure_once",
      amountPaise: 499_900,
    });
    expect(created.caseId).toBeTruthy();
    const mismatch = await repository.processEvent({
      provider: "RAZORPAY",
      providerEventId: "evt_wrong_amount",
      type: "payment_link_paid",
      caseId: created.caseId,
      providerPaymentId: "pay_wrong",
      amountPaise: 99,
    });
    expect(mismatch.message).toContain("mismatch");
    expect((await repository.getCase(created.caseId!))?.status).not.toBe(
      "RECOVERED",
    );
    const paid = await repository.processEvent({
      provider: "RAZORPAY",
      providerEventId: "evt_paid_once",
      type: "payment_link_paid",
      caseId: created.caseId,
      providerPaymentId: "pay_recovery_once",
      amountPaise: 499_900,
    });
    expect(paid.message).toContain("RECOVERED");
    const duplicate = await repository.processEvent({
      provider: "RAZORPAY",
      providerEventId: "evt_paid_once",
      type: "payment_link_paid",
      caseId: created.caseId,
      providerPaymentId: "pay_recovery_once",
      amountPaise: 499_900,
    });
    expect(duplicate.duplicate).toBe(true);
    const replayWithNewEventId = await repository.processEvent({
      provider: "RAZORPAY",
      providerEventId: "evt_paid_replayed",
      type: "payment_link_paid",
      caseId: created.caseId,
      providerPaymentId: "pay_recovery_once",
      amountPaise: 499_900,
    });
    expect(replayWithNewEventId.message).toContain("already recorded");
    expect(
      (await repository.getCase(created.caseId!))?.recoveredAmountPaise,
    ).toBe(499_900);
  });

  it.each(["payment_link_expired", "payment_link_cancelled"] as const)(
    "%s never counts recovery",
    async (type) => {
      const repository = new MemoryRecoveryRepository();
      const created = await repository.processEvent({
        provider: "RAZORPAY",
        providerEventId: `evt_failure_${type}`,
        type: "authentication_failure",
        providerPaymentId: `pay_${type}`,
        amountPaise: 72_500,
      });
      await repository.processEvent({
        provider: "RAZORPAY",
        providerEventId: `evt_${type}`,
        type,
        caseId: created.caseId,
        providerLinkId: `plink_${type}`,
      });
      const recovery = await repository.getCase(created.caseId!);
      expect(["ESCALATED", "STOPPED"]).toContain(recovery?.status);
      expect(recovery?.recoveredAmountPaise).toBe(0);
    },
  );
});
