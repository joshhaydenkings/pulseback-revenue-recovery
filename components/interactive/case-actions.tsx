"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Play,
  RefreshCcw,
  ShieldAlert,
  ShieldX,
  Square,
} from "lucide-react";

type Command = "approve" | "reject" | "stop" | "run" | "escalate";

export function CaseActions({ status, caseId }: { status: string; caseId: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  const mutate = async (url: string, body?: unknown) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json()) as {
      message?: string;
      error?: string;
      paymentLinkUrl?: string;
    };
    if (!response.ok) throw new Error(result.error ?? "Recovery action failed");
    setNotice(result.message ?? "Recovery case updated.");
    if (result.paymentLinkUrl)
      window.open(result.paymentLinkUrl, "_blank", "noopener,noreferrer");
    router.refresh();
  };

  const act = async (command: Command, label: string) => {
    if (
      (command === "stop" || command === "reject") &&
      !window.confirm(
        `${label} recovery ${caseId}? This will prevent further autonomous actions.`,
      )
    )
      return;
    setPending(command);
    setNotice("");
    setError("");
    try {
      await mutate(`/api/recoveries/${encodeURIComponent(caseId)}/actions`, {
        command,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery action failed");
    } finally {
      setPending("");
    }
  };

  const reanalyze = async () => {
    setPending("reanalyze");
    setNotice("");
    setError("");
    try {
      await mutate(
        `/api/recoveries/${encodeURIComponent(caseId)}/reanalyze`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Re-analysis failed");
    } finally {
      setPending("");
    }
  };

  const terminal = ["RECOVERED", "SELF_RECOVERED", "STOPPED"].includes(status);
  return (
    <>
      <div className="case-actions">
        {!terminal && (
          <button
            className="secondary-button"
            disabled={Boolean(pending)}
            onClick={reanalyze}
          >
            {pending === "reanalyze" ? (
              <Loader2 className="spin" size={14} />
            ) : (
              <RefreshCcw size={14} />
            )}
            Re-analyze
          </button>
        )}
        {status === "AWAITING_APPROVAL" && (
          <>
            <button
              className="primary-button"
              disabled={Boolean(pending)}
              onClick={() => act("approve", "Approve")}
            >
              {pending === "approve" ? (
                <Loader2 className="spin" size={14} />
              ) : (
                <Check size={14} />
              )}
              Approve action
            </button>
            <button
              className="secondary-button"
              disabled={Boolean(pending)}
              onClick={() => act("reject", "Reject")}
            >
              <ShieldX size={14} /> Reject
            </button>
          </>
        )}
        {["PLAN_READY", "SCHEDULED", "PENDING_OBSERVATION"].includes(status) && (
          <button
            className="primary-button"
            disabled={Boolean(pending)}
            onClick={() => act("run", "Run")}
          >
            <Play size={14} />
            {pending === "run" ? "Processing…" : "Run next action"}
          </button>
        )}
        {status === "RECOVERING" && (
          <button
            className="primary-button"
            disabled={Boolean(pending)}
            onClick={() => act("run", "Open")}
          >
            <ExternalLink size={14} />
            {pending === "run" ? "Opening…" : "Open Payment Link"}
          </button>
        )}
        {!terminal && (
          <button
            className="secondary-button"
            disabled={Boolean(pending)}
            onClick={() => act("stop", "Stop")}
          >
            <Square size={13} /> Stop recovery
          </button>
        )}
        {!['RECOVERED', 'SELF_RECOVERED', 'ESCALATED'].includes(status) && (
          <button
            className="secondary-button square"
            aria-label="Escalate recovery"
            disabled={Boolean(pending)}
            onClick={() => act("escalate", "Escalate")}
          >
            <ShieldAlert size={15} />
          </button>
        )}
        <button aria-label="More actions" className="secondary-button square">
          <MoreHorizontal size={15} />
        </button>
      </div>
      {notice && (
        <div className="action-toast">
          <Check size={14} /> {notice}
        </div>
      )}
      {error && (
        <div className="action-toast action-error">
          <ShieldX size={14} /> {error}
        </div>
      )}
    </>
  );
}
