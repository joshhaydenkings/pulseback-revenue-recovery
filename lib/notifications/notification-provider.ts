import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export interface NotificationDelivery {
  id: string;
  status: "simulated" | "sent";
  simulated: boolean;
  provider: "mock" | "resend";
}

export interface NotificationProvider {
  readonly kind: "mock" | "resend";
  sendEmail(input: EmailMessage): Promise<NotificationDelivery>;
}

export class NotificationProviderError extends Error {
  constructor(
    message: string,
    readonly code = "NOTIFICATION_PROVIDER_FAILURE",
    readonly status?: number,
  ) {
    super(message);
    this.name = "NotificationProviderError";
  }
}

export class MockNotificationProvider implements NotificationProvider {
  readonly kind = "mock" as const;

  async sendEmail(input: EmailMessage): Promise<NotificationDelivery> {
    return {
      id: `email_demo_${input.idempotencyKey.replace(/[^a-zA-Z0-9]/g, "_")}`,
      status: "simulated",
      simulated: true,
      provider: "mock",
    };
  }

  async sendRecoveryEmail(input: {
    recoveryCaseId: string;
    customer?: { name: string; email: string };
    amountPaise?: number;
    paymentLinkUrl?: string;
  }) {
    return {
      id: `email_demo_${input.recoveryCaseId}`,
      status: "simulated" as const,
      simulated: true,
    };
  }
}

export class ResendNotificationProvider implements NotificationProvider {
  readonly kind = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async sendEmail(input: EmailMessage): Promise<NotificationDelivery> {
    const response = await this.fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    if (!response.ok || !body.id) {
      throw new NotificationProviderError(
        body.message ?? `Resend request failed (${response.status})`,
        body.name ?? "RESEND_REQUEST_FAILED",
        response.status,
      );
    }
    return {
      id: body.id,
      status: "sent",
      simulated: false,
      provider: "resend",
    };
  }
}

export type NotificationConfiguration = {
  requestedProvider: "mock" | "resend";
  activeProvider: "mock" | "resend";
  configured: boolean;
  reason?: string;
  from?: string;
  testRecipientConfigured: boolean;
};

function safeEmail(value: string | undefined) {
  if (!value || /[\r\n]/.test(value)) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : undefined;
}

export function getNotificationConfiguration(): NotificationConfiguration {
  const requested = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const requestedProvider = requested === "resend" ? "resend" : "mock";
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const address = safeEmail(process.env.EMAIL_FROM_ADDRESS?.trim());
  const name = process.env.EMAIL_FROM_NAME?.trim().replace(/[\r\n]/g, "");
  const from = address ? (name ? `${name} <${address}>` : address) : undefined;
  const configured =
    requestedProvider === "resend" &&
    Boolean(apiKey?.startsWith("re_")) &&
    Boolean(from);
  return {
    requestedProvider,
    activeProvider: configured ? "resend" : "mock",
    configured,
    reason:
      requestedProvider === "resend" && !configured
        ? "Resend requires a valid RESEND_API_KEY and EMAIL_FROM_ADDRESS."
        : undefined,
    from,
    testRecipientConfigured: Boolean(
      safeEmail(process.env.EMAIL_TEST_RECIPIENT?.trim()),
    ),
  };
}

export function resolveNotificationProvider(options: { allowReal?: boolean } = {}) {
  const config = getNotificationConfiguration();
  if (!options.allowReal || config.activeProvider !== "resend")
    return new MockNotificationProvider();
  return new ResendNotificationProvider(
    process.env.RESEND_API_KEY!.trim(),
    config.from!,
  );
}

export function configuredTestRecipient() {
  return safeEmail(process.env.EMAIL_TEST_RECIPIENT?.trim());
}
