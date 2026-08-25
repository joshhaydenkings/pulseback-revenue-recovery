"use client";
import { useState } from "react";
import { CreditCard, IndianRupee, Loader2, ShieldCheck } from "lucide-react";

type CheckoutResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type RazorpayInstance = { open(): void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

async function loadCheckoutScript() {
  if (window.Razorpay) return true;
  return new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-pulseback-razorpay]",
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.dataset.pulsebackRazorpay = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function CheckoutDemo() {
  const [amount, setAmount] = useState(4999);
  const [customerId, setCustomerId] = useState("cust_3");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [caseId, setCaseId] = useState<string>();
  const pollForCase = async (orderId: string) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await fetch(
        `/api/razorpay/orders/${encodeURIComponent(orderId)}/case`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        found?: boolean;
        recovery?: { id: string };
      };
      if (result.found && result.recovery) {
        setCaseId(result.recovery.id);
        setNotice(
          "Verified provider event received. The persistent recovery case is ready.",
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    setNotice(
      "Still waiting for the Razorpay webhook. The order is saved and processing does not depend on this page staying open.",
    );
  };
  const start = async () => {
    setLoading(true);
    setNotice("");
    setCaseId(undefined);
    try {
      const response = await fetch("/api/razorpay/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountPaise: amount * 100,
          currency: "INR",
          customerId,
          scenario: "judge_checkout",
        }),
      });
      const order = (await response.json()) as {
        error?: string;
        simulated?: boolean;
        keyId?: string;
        amount: number;
        id: string;
        currency: string;
        customer?: { name: string; email: string };
      };
      if (!response.ok)
        throw new Error(order.error ?? "Unable to create order");
      if (order.simulated) {
        setNotice(
          "Razorpay Test Mode not configured — Demo Provider order created safely. No real money or provider Payment Link was used.",
        );
        return;
      }
      if (!(await loadCheckoutScript()) || !window.Razorpay)
        throw new Error("Razorpay Checkout could not be loaded");
      setNotice(
        "Razorpay Test Order created. Waiting for a verified provider event…",
      );
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: "PulseBack Test Checkout",
        description: "TEST MODE — no real money",
        prefill: order.customer
          ? { name: order.customer.name, email: order.customer.email }
          : undefined,
        handler: async (result: CheckoutResult) => {
          const verification = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              orderId: result.razorpay_order_id,
              paymentId: result.razorpay_payment_id,
              signature: result.razorpay_signature,
            }),
          });
          if (!verification.ok) {
            setNotice(
              "Checkout returned, but server-side signature verification failed. No payment state was trusted.",
            );
            return;
          }
          setNotice(
            "Checkout signature verified. Waiting for the authoritative Razorpay webhook…",
          );
          void pollForCase(order.id);
        },
        modal: {
          ondismiss: () => {
            setNotice(
              "Checkout closed. PulseBack will still process any webhook Razorpay sends.",
            );
            void pollForCase(order.id);
          },
        },
        theme: { color: "#319f91" },
      });
      checkout.open();
      void pollForCase(order.id);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to start Razorpay Test Checkout",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="checkout-card">
      <div className="checkout-preview">
        <span className="brand-mark">
          <i />
          <i />
          <i />
        </span>
        <p>RAZORPAY TEST MODE</p>
        <h2>
          <small>₹</small>
          {amount.toLocaleString("en-IN")}
        </h2>
        <span>No real money is involved</span>
      </div>
      <div className="checkout-form">
        <h3>Create Razorpay Test Payment</h3>
        <p>
          Create a persisted order server-side, launch Standard Checkout, then
          wait for a signed webhook to enter the shared recovery pipeline.
        </p>
        <label>
          Amount in INR
          <div className="amount-input">
            <IndianRupee size={15} />
            <input
              type="number"
              min="1"
              max="50000"
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
            />
          </div>
        </label>
        <label>
          Demo customer
          <select
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="cust_3">
              Neel Kapoor · neel.kapoor@example.com
            </option>
            <option value="cust_1">
              Aarav Mehta · aarav.mehta@example.com
            </option>
            <option value="cust_2">Ishita Rao · ishita.rao@example.com</option>
          </select>
        </label>
        <button className="primary-button" onClick={start} disabled={loading}>
          {loading ? (
            <Loader2 className="spin" size={15} />
          ) : (
            <CreditCard size={15} />
          )}{" "}
          Start Razorpay Test Checkout
        </button>
        {notice && (
          <div className="checkout-notice">
            <ShieldCheck size={16} />
            <span>
              {notice}
              {caseId && (
                <>
                  {" "}
                  <a href={`/recoveries/${caseId}`}>View Recovery Case</a>
                </>
              )}
            </span>
          </div>
        )}
        <small>
          Card numbers, CVV and authentication data are collected only by
          Razorpay Checkout. PulseBack never stores them.
        </small>
      </div>
    </div>
  );
}
