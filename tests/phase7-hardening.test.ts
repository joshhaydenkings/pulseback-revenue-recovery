import { describe, expect, it } from "vitest";
import { POST as razorpayWebhook } from "../app/api/webhooks/razorpay/route";
import { MemoryRecoveryRepository } from "../repositories/memory-recovery-repository";

function failedEvent(id: string, type: "authentication_failure" | "high_value_failure" = "authentication_failure") {
  return {
    provider: "TEST",
    providerEventId: `evt_${id}`,
    providerPaymentId: `pay_${id}`,
    type,
    amountPaise: type === "high_value_failure" ? 4_200_000 : 499_900,
  } as const;
}

describe("Phase 7 financial safety invariants", () => {
  it("preserves RECOVERED when a stale link-expired event arrives", async () => {
    const repository = new MemoryRecoveryRepository();
    const created = await repository.processEvent(failedEvent("terminal_expiry"));
    await repository.runCaseCommand(created.caseId!, "run");
    await repository.processEvent({
      provider: "TEST",
      providerEventId: "evt_terminal_paid",
      type: "payment_link_paid",
      caseId: created.caseId,
      amountPaise: 499_900,
    });
    const stale = await repository.processEvent({
      provider: "TEST",
      providerEventId: "evt_terminal_expired",
      type: "payment_link_expired",
      caseId: created.caseId,
    });
    expect(stale.message).toContain("RECOVERED");
    expect((await repository.getCase(created.caseId!))?.status).toBe("RECOVERED");
  });

  it("rejects a Razorpay payment event with the wrong link reference", async () => {
    const repository = new MemoryRecoveryRepository();
    const created = await repository.processEvent({
      ...failedEvent("wrong_reference"),
      provider: "RAZORPAY",
    });
    await repository.runCaseCommand(created.caseId!, "run");
    const recovery = await repository.getCase(created.caseId!);
    const result = await repository.processEvent({
      provider: "RAZORPAY",
      providerEventId: "evt_wrong_reference_paid",
      type: "payment_link_paid",
      caseId: created.caseId,
      providerLinkId: recovery!.activePaymentLinkId,
      providerLinkReference: "pulseback_recovery_some_other_case",
      amountPaise: 499_900,
    });
    expect(result.message).toContain("mismatch");
    expect((await repository.getCase(created.caseId!))?.status).not.toBe("RECOVERED");
  });

  it("allows only one simultaneous approval to claim a case", async () => {
    const repository = new MemoryRecoveryRepository();
    const created = await repository.processEvent(failedEvent("double_approve", "high_value_failure"));
    const outcomes = await Promise.allSettled([
      repository.runCaseCommand(created.caseId!, "approve"),
      repository.runCaseCommand(created.caseId!, "approve"),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect((await repository.getCase(created.caseId!))?.status).toBe("SCHEDULED");
  });

  it("allows only one simultaneous re-analysis", async () => {
    const repository = new MemoryRecoveryRepository();
    const created = await repository.processEvent(failedEvent("double_analysis"));
    const first = repository.reanalyzeCase(created.caseId!);
    const second = repository.reanalyzeCase(created.caseId!);
    await expect(second).rejects.toThrow("already in progress");
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it("blocks execution after a case reaches a terminal state", async () => {
    const repository = new MemoryRecoveryRepository();
    const created = await repository.processEvent(failedEvent("terminal_run"));
    await repository.runCaseCommand(created.caseId!, "stop");
    await expect(repository.runCaseCommand(created.caseId!, "run")).rejects.toThrow("terminal stopped");
  });

  it("suppresses a repeated recovery email in demo fallback mode", async () => {
    const repository = new MemoryRecoveryRepository();
    const created = await repository.processEvent(failedEvent("duplicate_email"));
    await repository.runCaseCommand(created.caseId!, "run");
    const first = await repository.sendRecoveryEmail(created.caseId!);
    const second = await repository.sendRecoveryEmail(created.caseId!);
    expect(first.status).toBe("SIMULATED");
    expect(second.status).toBe("DUPLICATE");
  });

  it("rejects oversized Razorpay webhooks before configuration or parsing", async () => {
    const response = await razorpayWebhook(
      new Request("http://localhost/api/webhooks/razorpay", {
        method: "POST",
        headers: { "content-length": "1000001" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Webhook payload is too large" });
  });
});
