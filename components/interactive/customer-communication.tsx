"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Loader2, Mail, ShieldX, X } from "lucide-react";
import type { RecoveryEmailPreview } from "../../repositories/types";

export function CustomerCommunication({ caseId, hasPaymentLink, status }: { caseId: string; hasPaymentLink: boolean; status: string }) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<RecoveryEmailPreview>();
  const [pending, setPending] = useState<"preview" | "send" | "">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const terminal = ["RECOVERED", "SELF_RECOVERED", "STOPPED", "FAILED", "ESCALATED"].includes(status);
  useEffect(() => {
    if (!preview) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(undefined);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [preview]);
  const loadPreview = async () => {
    setPending("preview"); setError("");
    try {
      const response = await fetch(`/api/recoveries/${encodeURIComponent(caseId)}/email`, { cache: "no-store" });
      const result = (await response.json()) as RecoveryEmailPreview & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to preview recovery email");
      setPreview(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Preview failed"); }
    finally { setPending(""); }
  };
  const send = async () => {
    if (!window.confirm("Send this controlled recovery email after Guardian re-checks the case?")) return;
    setPending("send"); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/recoveries/${encodeURIComponent(caseId)}/email`, { method: "POST" });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Email send failed");
      setNotice(result.message ?? "Recovery email processed.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Email send failed"); }
    finally { setPending(""); }
  };
  return <section className="panel communication-panel">
    <div className="communication-heading"><span><Mail size={17} /></span><div><h3>Customer Communication</h3><p>Controlled template · server-trusted recipient and link</p></div></div>
    <div className="communication-status"><span>Payment Link</span><b>{terminal ? "CONTACT BLOCKED" : hasPaymentLink ? "READY" : "REQUIRED"}</b></div>
    <p className="communication-copy">{terminal ? `Customer contact is disabled because this case is ${status.toLowerCase()}.` : "Preview the exact template before a Guardian-checked email leaves PulseBack."}</p>
    <div className="communication-actions">
      <button className="secondary-button" onClick={loadPreview} disabled={Boolean(pending) || !hasPaymentLink || terminal}>{pending === "preview" ? <Loader2 className="spin" size={13} /> : <Eye size={13} />} Preview email</button>
      <button className="primary-button" onClick={send} disabled={Boolean(pending) || !hasPaymentLink || terminal}>{pending === "send" ? <Loader2 className="spin" size={13} /> : <Mail size={13} />} Send recovery email</button>
    </div>
    {notice && <div className="inline-notice success"><Check size={13} />{notice}</div>}
    {error && <div className="inline-notice error"><ShieldX size={13} />{error}</div>}
    {preview && <div className="email-preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="recovery-email-title"><div className="email-preview-modal">
      <div className="email-preview-head"><div><span>TO {preview.recipient}</span><h3 id="recovery-email-title">{preview.subject}</h3></div><button ref={closeButtonRef} aria-label="Close email preview" onClick={() => setPreview(undefined)}><X size={16} /></button></div>
      {!preview.canSend && <div className="email-preview-warning"><ShieldX size={14} />{preview.blockedReasons.join(" · ")}</div>}
      <iframe title="PulseBack recovery email" sandbox="" srcDoc={preview.html} />
      <div className="email-preview-foot"><span>{preview.provider === "resend" ? "RESEND" : "MOCK"} PROVIDER</span><button className="primary-button" disabled={!preview.canSend || Boolean(pending)} onClick={send}><Mail size={13} /> Send this email</button></div>
    </div></div>}
  </section>;
}
