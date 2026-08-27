import "server-only";
import { formatInrPaise } from "../money";

export const RECOVERY_EMAIL_TEMPLATE = "RECOVERY_PAYMENT_LINK_V1";

export interface RecoveryEmailTemplateInput {
  customerName: string;
  amountPaise: number;
  paymentLinkUrl: string;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

export function isTrustedRazorpayPaymentLink(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "rzp.io" || url.hostname.endsWith(".razorpay.com"))
    );
  } catch {
    return false;
  }
}

export function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return "invalid recipient";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export function renderRecoveryEmail(input: RecoveryEmailTemplateInput) {
  if (!isTrustedRazorpayPaymentLink(input.paymentLinkUrl))
    throw new Error("A trusted persisted Razorpay Payment Link is required");
  const name = input.customerName.trim() || "there";
  const amount = formatInrPaise(input.amountPaise);
  const subject = `Complete your ${amount} payment securely`;
  const safeName = escapeHtml(name);
  const safeAmount = escapeHtml(amount);
  const safeUrl = escapeHtml(input.paymentLinkUrl);
  const text = [
    `Hi ${name},`,
    "",
    `Your payment of ${amount} could not be completed. You can retry securely using the Razorpay Test Payment Link below:`,
    input.paymentLinkUrl,
    "",
    "If you have already completed this payment, you can ignore this message.",
    "",
    "PulseBack Recovery",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#15233b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e4e9f1;border-radius:16px"><tr><td style="padding:30px"><div style="font-weight:800;font-size:20px;color:#2962ff">PulseBack</div><h1 style="font-size:24px;line-height:1.25;margin:28px 0 12px">Complete your payment securely</h1><p style="line-height:1.65;margin:0 0 16px">Hi ${safeName},</p><p style="line-height:1.65;margin:0 0 24px">Your payment of <strong>${safeAmount}</strong> could not be completed. Use the secure Razorpay Test Payment Link below to retry.</p><a href="${safeUrl}" style="display:inline-block;background:#2962ff;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:9px">Pay ${safeAmount}</a><p style="font-size:13px;line-height:1.55;color:#68758a;margin:24px 0 0">If you have already completed this payment, you can ignore this message. PulseBack never asks for card details by email.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text, amount };
}
