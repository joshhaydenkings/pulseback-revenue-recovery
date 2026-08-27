"use client";

import { useState } from "react";
import { Check, Loader2, Mail, ShieldX } from "lucide-react";

export function NotificationTestButton({ enabled }: { enabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const test = async () => {
    setPending(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/integrations/notifications/test", { method: "POST" });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Test email failed");
      setMessage(result.message ?? "Test email accepted.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Test email failed"); }
    finally { setPending(false); }
  };
  return <div className="integration-test-control"><button className="secondary-button" disabled={!enabled || pending} onClick={test}>{pending ? <Loader2 className="spin" size={13} /> : <Mail size={13} />}Send fixed test email</button>{message && <small className="test-success"><Check size={12} />{message}</small>}{error && <small className="test-error"><ShieldX size={12} />{error}</small>}</div>;
}
