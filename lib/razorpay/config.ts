export type RazorpayConfigurationStatus = "connected" | "demo" | "invalid";

export interface RazorpayConfiguration {
  status: RazorpayConfigurationStatus;
  keyId?: string;
  publicKeyId?: string;
  keySecret?: string;
  webhookSecret?: string;
  webhookConfigured: boolean;
  reason?: string;
}

type Environment = Record<string, string | undefined>;

export function getRazorpayConfiguration(
  environment: Environment = process.env,
): RazorpayConfiguration {
  const keyId = environment.RAZORPAY_KEY_ID?.trim();
  const publicKeyId = environment.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim();
  const keySecret = environment.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = environment.RAZORPAY_WEBHOOK_SECRET?.trim();
  const values = [keyId, publicKeyId].filter(Boolean) as string[];
  if (values.some((value) => value.startsWith("rzp_live_")))
    return {
      status: "invalid",
      webhookConfigured: Boolean(webhookSecret),
      reason:
        "PulseBack hackathon build requires Razorpay Test Mode credentials.",
    };
  if (!keyId && !keySecret && !publicKeyId)
    return {
      status: "demo",
      webhookConfigured: Boolean(webhookSecret),
      reason: "Razorpay Test Mode is not configured — Demo Provider active.",
    };
  if (
    !keyId?.startsWith("rzp_test_") ||
    !keySecret ||
    !publicKeyId?.startsWith("rzp_test_")
  )
    return {
      status: "invalid",
      webhookConfigured: Boolean(webhookSecret),
      reason: "Complete Razorpay Test Mode key configuration is required.",
    };
  if (keyId !== publicKeyId)
    return {
      status: "invalid",
      webhookConfigured: Boolean(webhookSecret),
      reason: "The server and public Razorpay Test key IDs do not match.",
    };
  return {
    status: "connected",
    keyId,
    publicKeyId,
    keySecret,
    webhookSecret,
    webhookConfigured: Boolean(webhookSecret),
  };
}

export function maskedRazorpayKey(keyId?: string) {
  return keyId ? `${keyId.slice(0, 9)}••••••${keyId.slice(-4)}` : undefined;
}

export function publicRazorpayConfiguration(
  environment: Environment = process.env,
) {
  const config = getRazorpayConfiguration(environment);
  return {
    status: config.status,
    mode: "TEST" as const,
    provider:
      config.status === "connected"
        ? "Razorpay Test Mode"
        : "PulseBack Demo Provider",
    keyId: maskedRazorpayKey(config.keyId),
    webhookConfigured: config.webhookConfigured,
    reason: config.reason,
  };
}
