import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNotificationConfiguration,
  ResendNotificationProvider,
} from "../lib/notifications/notification-provider";
import {
  isTrustedRazorpayPaymentLink,
  renderRecoveryEmail,
} from "../lib/notifications/recovery-email-template";
import { MemoryRecoveryRepository } from "../repositories/memory-recovery-repository";

afterEach(() => vi.unstubAllEnvs());

describe("Phase 6 recovery email", () => {
  it("renders controlled HTML and escapes customer data", () => {
    const email = renderRecoveryEmail({
      customerName: '<img src=x onerror="alert(1)">',
      amountPaise: 499_900,
      paymentLinkUrl: "https://rzp.io/i/pulseback-test",
    });
    expect(email.subject).toContain("₹4,999");
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img");
    expect(email.text).toContain("https://rzp.io/i/pulseback-test");
  });

  it("accepts only HTTPS Razorpay payment-link hosts", () => {
    expect(isTrustedRazorpayPaymentLink("https://rzp.io/i/valid")).toBe(true);
    expect(isTrustedRazorpayPaymentLink("https://api.razorpay.com/link/valid")).toBe(true);
    expect(isTrustedRazorpayPaymentLink("http://rzp.io/i/insecure")).toBe(false);
    expect(isTrustedRazorpayPaymentLink("https://evil.example/rzp.io")).toBe(false);
  });

  it("sends through Resend with provider idempotency and reports accepted, not delivered", async () => {
    const fetcher = vi.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => {
      void _input;
      void _init;
      return new Response(JSON.stringify({ id: "email_provider_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const provider = new ResendNotificationProvider(
      "re_test",
      "PulseBack <recovery@example.com>",
      fetcher as typeof fetch,
    );
    const result = await provider.sendEmail({
      to: "customer@example.com",
      subject: "Controlled subject",
      html: "<p>Controlled body</p>",
      text: "Controlled body",
      idempotencyKey: "pulseback:case:link:v1",
    });
    expect(result.status).toBe("sent");
    expect(result).not.toHaveProperty("delivered");
    expect(fetcher).toHaveBeenCalledOnce();
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe(
      "pulseback:case:link:v1",
    );
  });

  it("falls back safely when Resend configuration is incomplete", () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "");
    expect(getNotificationConfiguration()).toMatchObject({
      requestedProvider: "resend",
      activeProvider: "mock",
      configured: false,
    });
  });

  it("surfaces a provider rejection without claiming delivery", async () => {
    const provider = new ResendNotificationProvider(
      "re_test",
      "PulseBack <recovery@example.com>",
      (async () =>
        new Response(
          JSON.stringify({ name: "rate_limit_exceeded", message: "Try later" }),
          { status: 429, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    );
    await expect(
      provider.sendEmail({
        to: "customer@example.com",
        subject: "Controlled subject",
        html: "<p>Controlled body</p>",
        text: "Controlled body",
        idempotencyKey: "pulseback:provider-failure:v1",
      }),
    ).rejects.toMatchObject({ code: "rate_limit_exceeded", status: 429 });
  });

  it("keeps the in-memory demo path simulated even when real env vars exist", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "recovery@example.com");
    const repository = new MemoryRecoveryRepository();
    const created = await repository.processEvent({
      provider: "TEST",
      providerEventId: "phase6_email_case",
      type: "authentication_failure",
      providerPaymentId: "pay_phase6_email_case",
      amountPaise: 499_900,
      customerName: "Email Test Customer",
      customerEmail: "email-test@example.com",
    });
    await repository.runCaseCommand(created.caseId!, "run");
    const preview = await repository.getRecoveryEmailPreview(created.caseId!);
    const result = await repository.sendRecoveryEmail(created.caseId!);
    expect(preview.provider).toBe("mock");
    expect(result.status).toBe("SIMULATED");
    expect(result.providerMessageId).toContain("email_demo_");
  });

  it("suppresses customer contact in Shadow mode", async () => {
    const repository = new MemoryRecoveryRepository();
    const created = await repository.processEvent({
      provider: "TEST",
      providerEventId: "phase6_shadow_case",
      type: "authentication_failure",
      providerPaymentId: "pay_phase6_shadow_case",
      amountPaise: 499_900,
      customerName: "Shadow Customer",
      customerEmail: "shadow@example.com",
    });
    await repository.runCaseCommand(created.caseId!, "run");
    const policies = await repository.getPolicies();
    await repository.savePolicies({ ...policies, operatingMode: "SHADOW" });
    const result = await repository.sendRecoveryEmail(created.caseId!);
    expect(result.status).toBe("SUPPRESSED");
    expect(result.message).toContain("Shadow mode");
  });
});
