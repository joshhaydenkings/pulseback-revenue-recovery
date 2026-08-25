import { getRazorpayConfiguration } from "./config";

export interface ProviderOrder {
  id: string;
  amountPaise: number;
  currency: "INR";
  status: string;
  receipt: string;
}
export interface PaymentLink {
  id: string;
  shortUrl: string;
  status: "created" | "issued" | "paid" | "cancelled" | "expired";
  amountPaise: number;
  referenceId: string;
  expiresAt?: string;
}
export interface PaymentProvider {
  readonly kind: "mock" | "razorpay-test";
  createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<ProviderOrder>;
  getPayment(
    id: string,
  ): Promise<{
    id: string;
    status: string;
    orderId?: string;
    amountPaise?: number;
  }>;
  createPaymentLink(input: {
    amountPaise: number;
    referenceId: string;
    customer: { name: string; email: string };
    expiresAt?: string;
    notes?: Record<string, string>;
  }): Promise<PaymentLink>;
  getPaymentLink?(id: string): Promise<PaymentLink>;
  cancelPaymentLink?(id: string): Promise<void>;
}

export class RazorpayProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RazorpayProviderError";
  }
}

export class MockPaymentProvider implements PaymentProvider {
  readonly kind = "mock" as const;
  private links = new Map<string, PaymentLink>();
  constructor(private injectFailure = false) {}
  async createOrder(input: { amountPaise: number; receipt: string }) {
    return {
      id: `order_demo_${input.receipt}`,
      amountPaise: input.amountPaise,
      currency: "INR" as const,
      status: "created",
      receipt: input.receipt,
    };
  }
  async getPayment(id: string) {
    return { id, status: "failed" };
  }
  async createPaymentLink(input: {
    amountPaise: number;
    referenceId: string;
    customer: { name: string; email: string };
    expiresAt?: string;
  }) {
    if (this.injectFailure)
      throw new RazorpayProviderError(
        "Injected provider failure",
        503,
        "SIMULATED_PROVIDER_UNAVAILABLE",
      );
    const existing = this.links.get(input.referenceId);
    if (existing) return existing;
    const link = {
      id: `plink_demo_${input.referenceId}`,
      shortUrl: `https://rzp.io/i/demo-${input.referenceId}`,
      status: "created" as const,
      amountPaise: input.amountPaise,
      referenceId: input.referenceId,
      expiresAt: input.expiresAt,
    };
    this.links.set(input.referenceId, link);
    return link;
  }
  async getPaymentLink(id: string) {
    const link = [...this.links.values()].find((value) => value.id === id);
    if (!link)
      throw new RazorpayProviderError(
        "Mock Payment Link not found",
        404,
        "NOT_FOUND",
      );
    return link;
  }
  async cancelPaymentLink(id: string) {
    for (const [key, link] of this.links)
      if (link.id === id) this.links.set(key, { ...link, status: "cancelled" });
  }
}

type Fetcher = typeof fetch;
type RazorpayErrorBody = { error?: { code?: string; description?: string } };

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly kind = "razorpay-test" as const;
  private readonly auth: string;
  constructor(
    private readonly keyId: string,
    keySecret: string,
    private readonly fetcher: Fetcher = fetch,
  ) {
    if (!keyId.startsWith("rzp_test_"))
      throw new RazorpayProviderError(
        "PulseBack hackathon build requires Razorpay Test Mode credentials.",
      );
    this.auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  }
  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${this.auth}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      let body: RazorpayErrorBody = {};
      try {
        body = (await response.json()) as RazorpayErrorBody;
      } catch {
        /* non-JSON provider error */
      }
      throw new RazorpayProviderError(
        body.error?.description ??
          `Razorpay Test API request failed (${response.status})`,
        response.status,
        body.error?.code,
      );
    }
    return response.json() as Promise<T>;
  }
  async createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }) {
    const result = await this.call<{
      id: string;
      amount: number;
      currency: "INR";
      status: string;
      receipt: string;
    }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        receipt: input.receipt,
        notes: input.notes,
      }),
    });
    return {
      id: result.id,
      amountPaise: result.amount,
      currency: result.currency,
      status: result.status,
      receipt: result.receipt,
    };
  }
  async getPayment(id: string) {
    const result = await this.call<{
      id: string;
      status: string;
      order_id?: string;
      amount?: number;
    }>(`/payments/${encodeURIComponent(id)}`);
    return {
      id: result.id,
      status: result.status,
      orderId: result.order_id,
      amountPaise: result.amount,
    };
  }
  async createPaymentLink(input: {
    amountPaise: number;
    referenceId: string;
    customer: { name: string; email: string };
    expiresAt?: string;
    notes?: Record<string, string>;
  }) {
    const result = await this.call<{
      id: string;
      short_url: string;
      status: PaymentLink["status"];
      amount: number;
      reference_id: string;
      expire_by?: number;
    }>("/payment_links", {
      method: "POST",
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        reference_id: input.referenceId,
        customer: input.customer,
        description: "PulseBack Test Mode recovery payment",
        expire_by: input.expiresAt
          ? Math.floor(new Date(input.expiresAt).getTime() / 1000)
          : undefined,
        notes: input.notes,
      }),
    });
    return {
      id: result.id,
      shortUrl: result.short_url,
      status: result.status,
      amountPaise: result.amount,
      referenceId: result.reference_id,
      expiresAt: result.expire_by
        ? new Date(result.expire_by * 1000).toISOString()
        : undefined,
    };
  }
  async getPaymentLink(id: string) {
    const result = await this.call<{
      id: string;
      short_url: string;
      status: PaymentLink["status"];
      amount: number;
      reference_id: string;
      expire_by?: number;
    }>(`/payment_links/${encodeURIComponent(id)}`);
    return {
      id: result.id,
      shortUrl: result.short_url,
      status: result.status,
      amountPaise: result.amount,
      referenceId: result.reference_id,
      expiresAt: result.expire_by
        ? new Date(result.expire_by * 1000).toISOString()
        : undefined,
    };
  }
  async cancelPaymentLink(id: string) {
    await this.call(`/payment_links/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
    });
  }
}

export function resolvePaymentProvider(
  options: { preferRazorpay?: boolean; injectFailure?: boolean } = {},
) {
  if (!options.preferRazorpay)
    return {
      kind: "mock" as const,
      provider: new MockPaymentProvider(options.injectFailure),
    };
  const config = getRazorpayConfiguration();
  if (config.status === "invalid")
    throw new RazorpayProviderError(
      config.reason ?? "Invalid Razorpay Test Mode configuration",
    );
  if (config.status === "connected")
    return {
      kind: "razorpay-test" as const,
      provider: new RazorpayPaymentProvider(config.keyId!, config.keySecret!),
    };
  return {
    kind: "mock" as const,
    provider: new MockPaymentProvider(options.injectFailure),
  };
}
