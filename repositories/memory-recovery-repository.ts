import type { EvaluationResult } from "../domain/evaluation/simulator";
import type {
  CustomerMemory,
  GuardianPolicies,
  RecoveryCase,
  TimelineEvent,
} from "../domain/recovery/types";
import { DEFAULT_POLICIES } from "../domain/recovery/types";
import { auditEvents, demoCases } from "../lib/demo-data";
import {
  actionTypeFor,
  buildDeterministicDecision,
  failureDescriptionFor,
  guardianFor,
  scoreRecovery,
} from "../services/deterministic-recovery";
import type {
  AuditRecord,
  CaseCommand,
  CaseCommandResult,
  DashboardSnapshot,
  DueActionResult,
  EvaluationRunSummary,
  RecoveryEventInput,
  RecoveryEventResult,
  RecoveryRepository,
} from "./types";

type MemoryAction = {
  id: string;
  caseId: string;
  type: string;
  status:
    | "PENDING"
    | "SCHEDULED"
    | "APPROVED"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLED"
    | "REJECTED"
    | "SKIPPED";
  scheduledFor?: string;
  providerReference?: string;
  injectFailure?: boolean;
};

const activeStatuses = new Set([
  "DETECTED",
  "PENDING_OBSERVATION",
  "ANALYZING",
  "PLAN_READY",
  "AWAITING_APPROVAL",
  "SCHEDULED",
  "ACTION_IN_PROGRESS",
  "RECOVERING",
]);

function cloneCase(value: RecoveryCase): RecoveryCase {
  return structuredClone(value);
}
function nowIso() {
  return new Date().toISOString();
}
function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(-14);
}

export class MemoryRecoveryRepository implements RecoveryRepository {
  readonly kind = "demo-memory" as const;
  private cases = demoCases.map(cloneCase);
  private policies = { ...DEFAULT_POLICIES };
  private audits: AuditRecord[] = structuredClone(auditEvents);
  private webhookEvents = new Set<string>();
  private evaluations: EvaluationRunSummary[] = [];
  private actions: MemoryAction[] = demoCases
    .filter((c) => c.currentStrategy !== "OBSERVE" || c.nextActionAt)
    .map((c) => ({
      id: `action_${c.id}`,
      caseId: c.id,
      type: c.currentStrategy,
      status:
        c.status === "RECOVERED"
          ? "SUCCEEDED"
          : c.status === "STOPPED"
            ? "CANCELLED"
            : c.status === "ESCALATED"
              ? "FAILED"
              : c.status === "AWAITING_APPROVAL"
                ? "PENDING"
                : c.status === "RECOVERING"
                  ? "SUCCEEDED"
                  : "SCHEDULED",
      scheduledFor: c.nextActionAt,
      providerReference: c.activePaymentLinkId,
    }));

  async listCases() {
    return this.cases
      .map(cloneCase)
      .sort((a, b) => b.opportunityScore - a.opportunityScore);
  }
  async getCase(id: string) {
    const found = this.cases.find((c) => c.id === id);
    return found ? cloneCase(found) : undefined;
  }
  async listAuditEvents() {
    return structuredClone(this.audits).sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
  }
  async getPolicies() {
    return { ...this.policies };
  }

  async savePolicies(policies: GuardianPolicies, actor = "MERCHANT") {
    const previousMode = this.policies.operatingMode;
    this.policies = { ...policies };
    for (const recovery of this.cases)
      recovery.operatingMode = policies.operatingMode;
    this.audit(
      undefined,
      "POLICY",
      previousMode === policies.operatingMode
        ? "POLICY_UPDATED"
        : "OPERATING_MODE_CHANGED",
      actor,
      previousMode === policies.operatingMode
        ? "Guardian policy configuration updated."
        : `Operating mode changed from ${previousMode} to ${policies.operatingMode}.`,
      { policies },
    );
    return { ...this.policies };
  }

  async processEvent(input: RecoveryEventInput): Promise<RecoveryEventResult> {
    const eventKey = `${input.provider}:${input.providerEventId}`;
    if (this.webhookEvents.has(eventKey)) {
      this.audit(
        input.caseId,
        "WEBHOOK",
        "DUPLICATE_EVENT_IGNORED",
        "SYSTEM",
        `Duplicate ${input.provider} event ignored safely.`,
        { providerEventId: input.providerEventId },
      );
      return {
        ok: true,
        duplicate: true,
        eventId: input.providerEventId,
        caseId: input.caseId,
        message: "Duplicate event ignored. No case or action was created.",
      };
    }
    this.webhookEvents.add(eventKey);

    const existing = input.caseId
      ? this.cases.find((c) => c.id === input.caseId)
      : input.providerPaymentId
        ? this.cases.find((c) => c.paymentId === input.providerPaymentId)
        : undefined;
    if (
      input.type === "late_authorization" ||
      input.type === "payment_captured"
    ) {
      if (!existing)
        return {
          ok: true,
          duplicate: false,
          eventId: input.providerEventId,
          message: "Payment update recorded; no active recovery case matched.",
        };
      if (activeStatuses.has(existing.status)) {
        this.actions
          .filter(
            (a) =>
              a.caseId === existing.id &&
              ["PENDING", "SCHEDULED", "APPROVED"].includes(a.status),
          )
          .forEach((a) => {
            a.status = "CANCELLED";
          });
        existing.status = "SELF_RECOVERED";
        existing.recoveredAmountPaise = existing.amountPaise;
        existing.nextActionAt = undefined;
        const event = this.timeline(
          existing,
          "RAZORPAY",
          "Payment authorized during observation",
          "success",
          "Pending recovery action cancelled. No customer contact was made.",
        );
        this.audit(
          existing.id,
          "RECOVERY",
          "LATE_AUTHORIZATION",
          "RAZORPAY",
          event.description ?? event.title,
          { recoveredAmountPaise: existing.amountPaise },
        );
      }
      return {
        ok: true,
        duplicate: false,
        eventId: input.providerEventId,
        caseId: existing.id,
        message:
          "Late Authorization Guard cancelled recovery and marked the case self-recovered.",
      };
    }
    if (input.type === "payment_link_paid") {
      if (!existing)
        return {
          ok: true,
          duplicate: false,
          eventId: input.providerEventId,
          message: "Payment Link event recorded; no recovery case matched.",
        };
      if (existing.status === "RECOVERED")
        return {
          ok: true,
          duplicate: false,
          eventId: input.providerEventId,
          caseId: existing.id,
          message:
            "Recovery was already recorded; no amount was counted twice.",
        };
      if (
        input.amountPaise !== undefined &&
        input.amountPaise !== existing.amountPaise
      ) {
        this.audit(
          existing.id,
          "SECURITY",
          "PAYMENT_LINK_AMOUNT_MISMATCH",
          "SYSTEM",
          "Payment Link payment amount did not match the recovery case.",
          {
            expectedAmountPaise: existing.amountPaise,
            receivedAmountPaise: input.amountPaise,
          },
        );
        return {
          ok: true,
          duplicate: false,
          eventId: input.providerEventId,
          caseId: existing.id,
          message: "Payment Link amount mismatch rejected.",
        };
      }
      existing.status = "RECOVERED";
      existing.recoveredAmountPaise = existing.amountPaise;
      existing.nextActionAt = undefined;
      this.actions
        .filter(
          (a) => a.caseId === existing.id && a.type === "CREATE_PAYMENT_LINK",
        )
        .forEach((a) => {
          a.status = "SUCCEEDED";
        });
      this.timeline(
        existing,
        "CUSTOMER",
        `${existing.amountPaise / 100} INR recovered`,
        "success",
        "Simulated Payment Link payment matched to the original recovery case.",
      );
      this.audit(
        existing.id,
        "RECOVERY",
        "PAYMENT_RECOVERED",
        "CUSTOMER",
        "Payment Link paid; recovery completed.",
        { recoveredAmountPaise: existing.amountPaise },
      );
      return {
        ok: true,
        duplicate: false,
        eventId: input.providerEventId,
        caseId: existing.id,
        message: "Recovery case marked RECOVERED.",
      };
    }
    if (
      (input.type === "payment_link_expired" ||
        input.type === "payment_link_cancelled") &&
      existing
    ) {
      existing.status =
        existing.attempts >= this.policies.maxAttemptsPerCase
          ? "STOPPED"
          : "ESCALATED";
      existing.activePaymentLinkId = undefined;
      existing.activePaymentLinkUrl = undefined;
      this.actions
        .filter(
          (a) => a.caseId === existing.id && a.type === "CREATE_PAYMENT_LINK",
        )
        .forEach((a) => {
          a.status = "CANCELLED";
        });
      this.timeline(
        existing,
        "SYSTEM",
        input.type === "payment_link_expired"
          ? "Payment Link expired"
          : "Payment Link cancelled",
        "warning",
        "No recovery was counted. The case moved to merchant review.",
      );
      this.audit(
        existing.id,
        "ACTION",
        input.type.toUpperCase(),
        "SYSTEM",
        "Payment Link became inactive without recovery.",
        { providerLinkId: input.providerLinkId },
      );
      return {
        ok: true,
        duplicate: false,
        eventId: input.providerEventId,
        caseId: existing.id,
        message: "Inactive Payment Link persisted without recovery.",
      };
    }
    if (input.type === "payment_link_error" && existing) {
      existing.status = "ESCALATED";
      this.actions
        .filter(
          (a) =>
            a.caseId === existing.id &&
            ["PENDING", "SCHEDULED", "APPROVED"].includes(a.status),
        )
        .forEach((a) => {
          a.status = "FAILED";
        });
      this.timeline(
        existing,
        "SYSTEM",
        "Provider action failed safely",
        "danger",
        "No duplicate customer-facing action was created. Case escalated.",
      );
      this.audit(
        existing.id,
        "ACTION",
        "ACTION_FAILED",
        "SYSTEM",
        "Mock provider action failed; case escalated safely.",
        { simulated: true },
      );
      return {
        ok: true,
        duplicate: false,
        eventId: input.providerEventId,
        caseId: existing.id,
        message: "Provider failure handled safely and case escalated.",
      };
    }

    const amountPaise =
      input.amountPaise ??
      (input.type === "high_value_failure" ? 4_200_000 : 499_900);
    const suffix = cleanId(input.providerEventId) || String(Date.now());
    const id = `RC-${suffix}`;
    const customerName =
      input.customerName ??
      (input.type === "high_value_failure" ? "Aarav Mehta" : "Demo Customer");
    const memory: CustomerMemory = {
      successfulPayments: 4,
      failedPayments: 1,
      recoveryAttempts: input.type === "repeated_failure" ? 2 : 0,
      contacts24h:
        input.type === "exhausted_contact_limit"
          ? this.policies.contactsPer24h
          : 0,
      contacts7d:
        input.type === "exhausted_contact_limit"
          ? this.policies.contactsPer7d
          : 1,
      previousRecoveries: 1,
      fatigueScore: input.type === "exhausted_contact_limit" ? 95 : 18,
      preferredMethod: input.paymentMethod ?? "Card •••• 4408",
    };
    const decision = buildDeterministicDecision(input.type, memory);
    const scored = scoreRecovery(amountPaise, decision, memory);
    const guardian = guardianFor(amountPaise, memory, decision, this.policies);
    const actionType = actionTypeFor(decision);
    const status: RecoveryCase["status"] =
      decision.recommendedAction === "STOP" || guardian.decision === "BLOCKED"
        ? "STOPPED"
        : this.policies.operatingMode === "SHADOW"
          ? "PLAN_READY"
          : guardian.decision === "APPROVAL_REQUIRED" ||
              this.policies.operatingMode === "APPROVAL"
            ? "AWAITING_APPROVAL"
            : decision.recommendedAction === "OBSERVE"
              ? "PENDING_OBSERVATION"
              : "SCHEDULED";
    const createdAt = nowIso();
    const scheduledFor = ["PENDING_OBSERVATION", "SCHEDULED"].includes(status)
      ? new Date(
          Date.now() + (decision.waitMinutes ?? 0) * 60_000,
        ).toISOString()
      : undefined;
    const recovery: RecoveryCase = {
      id,
      paymentId: input.providerPaymentId ?? `pay_sim_${suffix}`,
      customerId: `cust_sim_${suffix}`,
      customerName,
      customerEmail: input.customerEmail ?? "demo.customer@example.com",
      amountPaise,
      currency: "INR",
      paymentMethod: input.paymentMethod ?? "Card •••• 4408",
      status,
      failureCategory: decision.failureCategory,
      failureDescription: failureDescriptionFor(decision.failureCategory),
      opportunityScore: scored.score,
      predictedRecoveryProbability: decision.estimatedRecoveryProbability,
      expectedRecoverableValuePaise: scored.expectedRecoverableValuePaise,
      currentStrategy: actionType,
      attempts: memory.recoveryAttempts,
      recoveredAmountPaise: 0,
      riskFlags: decision.riskFlags,
      createdAt,
      nextActionAt: scheduledFor,
      operatingMode: this.policies.operatingMode,
      memory,
      decision,
      guardianDecision: guardian.decision,
      guardianReasons: guardian.reasons,
      provenance:
        input.provider === "RAZORPAY" ? "RAZORPAY_TEST" : "PULSEBACK_DEMO",
      timeline: [],
    };
    this.timeline(
      recovery,
      input.provider === "RAZORPAY" ? "RAZORPAY" : "SIMULATOR",
      "Payment failed",
      "danger",
      recovery.failureDescription,
    );
    this.timeline(
      recovery,
      "SYSTEM",
      "Recovery case created",
      "neutral",
      `${id} entered the persistent recovery pipeline.`,
    );
    this.timeline(
      recovery,
      "PULSEBACK_AI",
      "Deterministic Payment Autopsy completed",
      "ai",
      decision.merchantExplanation,
    );
    this.timeline(
      recovery,
      "GUARDIAN",
      guardian.decision === "APPROVED"
        ? "Recovery plan authorized"
        : guardian.decision === "BLOCKED"
          ? "Recovery stopped"
          : "Merchant approval required",
      guardian.decision === "APPROVED" ? "success" : "warning",
      guardian.reasons.join(" · "),
    );
    this.cases.push(recovery);
    this.actions.push({
      id: `action_${suffix}`,
      caseId: id,
      type: actionType,
      status:
        status === "STOPPED"
          ? "CANCELLED"
          : status === "SCHEDULED" || status === "PENDING_OBSERVATION"
            ? "SCHEDULED"
            : "PENDING",
      scheduledFor,
      injectFailure: input.injectProviderFailure,
    });
    for (const event of recovery.timeline)
      this.audit(
        id,
        "RECOVERY",
        event.title.toUpperCase().replaceAll(" ", "_"),
        event.actor,
        event.description ?? event.title,
        { providerEventId: input.providerEventId },
      );
    return {
      ok: true,
      duplicate: false,
      eventId: input.providerEventId,
      caseId: id,
      message:
        "Event persisted and processed through diagnosis, Guardian, action scheduling and audit.",
    };
  }

  async runCaseCommand(
    caseId: string,
    command: CaseCommand,
    reason?: string,
  ): Promise<CaseCommandResult> {
    const recovery = this.cases.find((c) => c.id === caseId);
    if (!recovery) throw new Error("Recovery case not found");
    const pending = this.actions.find(
      (a) =>
        a.caseId === caseId &&
        ["PENDING", "SCHEDULED", "APPROVED"].includes(a.status),
    );
    if (command === "stop" || command === "reject") {
      if (["RECOVERED", "SELF_RECOVERED", "STOPPED"].includes(recovery.status))
        throw new Error(
          `Cannot ${command} a ${recovery.status.toLowerCase()} case`,
        );
      this.actions
        .filter(
          (a) =>
            a.caseId === caseId &&
            ["PENDING", "SCHEDULED", "APPROVED"].includes(a.status),
        )
        .forEach((a) => {
          a.status = command === "reject" ? "REJECTED" : "CANCELLED";
        });
      recovery.status = "STOPPED";
      recovery.nextActionAt = undefined;
      this.timeline(
        recovery,
        "MERCHANT",
        command === "reject"
          ? "Recovery recommendation rejected"
          : "Recovery stopped",
        "warning",
        reason ?? "Merchant stopped further recovery activity.",
      );
      this.audit(
        caseId,
        "MERCHANT_ACTION",
        command === "reject" ? "ACTION_REJECTED" : "RECOVERY_STOPPED",
        "MERCHANT",
        reason ?? `Recovery ${command} persisted.`,
        {},
      );
      return {
        ok: true,
        case: cloneCase(recovery),
        message:
          command === "reject"
            ? "Recommendation rejected and recovery stopped."
            : "Recovery stopped. No further actions will run.",
      };
    }
    if (command === "escalate") {
      if (["RECOVERED", "SELF_RECOVERED"].includes(recovery.status))
        throw new Error("Recovered cases cannot be escalated");
      recovery.status = "ESCALATED";
      recovery.nextActionAt = undefined;
      this.timeline(
        recovery,
        "MERCHANT",
        "Recovery escalated",
        "warning",
        reason ?? "Merchant escalated the case for manual review.",
      );
      this.audit(
        caseId,
        "MERCHANT_ACTION",
        "RECOVERY_ESCALATED",
        "MERCHANT",
        reason ?? "Case escalated.",
        {},
      );
      return {
        ok: true,
        case: cloneCase(recovery),
        message: "Recovery escalated for manual review.",
      };
    }
    if (command === "approve") {
      if (recovery.status !== "AWAITING_APPROVAL" || !pending)
        throw new Error("This case is not awaiting approval");
      pending.status = "SCHEDULED";
      pending.scheduledFor = nowIso();
      recovery.status = "SCHEDULED";
      recovery.nextActionAt = pending.scheduledFor;
      this.timeline(
        recovery,
        "MERCHANT",
        "Recovery action approved",
        "success",
        "Guardian checks will run again immediately before execution.",
      );
      this.audit(
        caseId,
        "MERCHANT_ACTION",
        "ACTION_APPROVED",
        "MERCHANT",
        "Merchant approved the pending recovery action.",
        {},
      );
      return {
        ok: true,
        case: cloneCase(recovery),
        message: "Action approved and scheduled.",
      };
    }
    if (command === "run") {
      if (recovery.activePaymentLinkId) {
        return {
          ok: true,
          case: cloneCase(recovery),
          message: "Existing simulated Payment Link reused.",
          reused: true,
          paymentLinkUrl: `https://rzp.io/i/demo-${recovery.id}`,
        };
      }
      if (!pending) throw new Error("No pending recovery action is available");
      const guardian = guardianFor(
        recovery.amountPaise,
        recovery.memory,
        recovery.decision,
        this.policies,
      );
      if (guardian.decision === "BLOCKED") {
        pending.status = "SKIPPED";
        recovery.status = "STOPPED";
        recovery.nextActionAt = undefined;
        this.audit(
          caseId,
          "GUARDIAN",
          "ACTION_BLOCKED",
          "GUARDIAN",
          guardian.reasons.join(" · "),
          {},
        );
        return {
          ok: true,
          case: cloneCase(recovery),
          message: "Guardian blocked the action.",
        };
      }
      if (
        guardian.decision === "APPROVAL_REQUIRED" &&
        pending.status !== "APPROVED" &&
        this.policies.operatingMode !== "AUTOPILOT"
      )
        throw new Error("Merchant approval is required before execution");
      if (pending.injectFailure) {
        pending.status = "FAILED";
        recovery.status = "ESCALATED";
        recovery.nextActionAt = undefined;
        this.timeline(
          recovery,
          "SYSTEM",
          "Provider action failed safely",
          "danger",
          "Mock provider failure was persisted. No duplicate action was created.",
        );
        this.audit(
          caseId,
          "ACTION",
          "ACTION_FAILED",
          "SYSTEM",
          "Mock provider action failed; case escalated.",
          { actionId: pending.id },
        );
        return {
          ok: true,
          case: cloneCase(recovery),
          message: "Mock provider failed safely; the case was escalated.",
        };
      }
      pending.status = "SUCCEEDED";
      recovery.attempts += 1;
      recovery.nextActionAt = undefined;
      if (pending.type === "CREATE_PAYMENT_LINK") {
        const reference = `plink_demo_${recovery.id}`;
        pending.providerReference = reference;
        recovery.activePaymentLinkId = reference;
        recovery.activePaymentLinkUrl = `https://rzp.io/i/demo-${recovery.id}`;
        recovery.status = "RECOVERING";
        this.timeline(
          recovery,
          "SYSTEM",
          "Simulated Payment Link created",
          "success",
          `${reference} persisted and ready for the demo customer.`,
        );
        this.audit(
          caseId,
          "ACTION",
          "PAYMENT_LINK_CREATED",
          "SYSTEM",
          "One persistent simulated Payment Link was created.",
          { providerReference: reference },
        );
        return {
          ok: true,
          case: cloneCase(recovery),
          message: "Simulated Payment Link created and persisted.",
          paymentLinkUrl: `https://rzp.io/i/demo-${recovery.id}`,
        };
      }
      recovery.status = "RECOVERING";
      this.timeline(
        recovery,
        "SYSTEM",
        `${pending.type.replaceAll("_", " ")} executed`,
        "success",
        "Mock executor completed the scheduled action.",
      );
      this.audit(
        caseId,
        "ACTION",
        "ACTION_EXECUTED",
        "SYSTEM",
        `${pending.type} executed by the mock provider.`,
        { actionId: pending.id },
      );
      return {
        ok: true,
        case: cloneCase(recovery),
        message: "Next recovery action executed and persisted.",
      };
    }
    throw new Error("Unsupported case command");
  }

  async processDueActions(now = new Date()): Promise<DueActionResult> {
    const due = this.actions.filter(
      (a) =>
        a.status === "SCHEDULED" &&
        a.scheduledFor &&
        new Date(a.scheduledFor) <= now,
    );
    const result = {
      processed: due.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };
    for (const action of due) {
      try {
        const outcome = await this.runCaseCommand(action.caseId, "run");
        if (outcome.case.status === "ESCALATED") result.failed++;
        else if (outcome.case.status === "STOPPED") result.skipped++;
        else result.succeeded++;
      } catch {
        result.failed++;
      }
    }
    return result;
  }

  async getDashboard(): Promise<DashboardSnapshot> {
    const cases = await this.listCases();
    const recovered = cases.filter((c) =>
      ["RECOVERED", "SELF_RECOVERED"].includes(c.status),
    );
    const atRisk = cases
      .filter((c) => c.status !== "RECOVERED" && c.status !== "SELF_RECOVERED")
      .reduce((sum, c) => sum + c.amountPaise, 0);
    const recoveredPaise = recovered.reduce(
      (sum, c) => sum + c.recoveredAmountPaise,
      0,
    );
    const needs = cases.filter((c) => c.status === "AWAITING_APPROVAL");
    const pulseMap = new Map<
      string,
      { date: string; atRisk: number; recovered: number }
    >();
    for (const c of cases) {
      const date = c.createdAt.slice(5, 10);
      const row = pulseMap.get(date) ?? { date, atRisk: 0, recovered: 0 };
      row.atRisk += c.amountPaise / 100;
      row.recovered += c.recoveredAmountPaise / 100;
      pulseMap.set(date, row);
    }
    const strategyMap = new Map<string, number>();
    for (const c of recovered)
      strategyMap.set(
        c.currentStrategy,
        (strategyMap.get(c.currentStrategy) ?? 0) +
          c.recoveredAmountPaise / 100,
      );
    return {
      revenueAtRiskPaise: atRisk,
      revenueRecoveredPaise: recoveredPaise,
      recoveryRate:
        atRisk + recoveredPaise
          ? recoveredPaise / (atRisk + recoveredPaise)
          : 0,
      activeRecoveries: cases.filter((c) => activeStatuses.has(c.status))
        .length,
      selfRecoveredPaise: cases
        .filter((c) => c.status === "SELF_RECOVERED")
        .reduce((sum, c) => sum + c.recoveredAmountPaise, 0),
      selfRecoveredCount: cases.filter((c) => c.status === "SELF_RECOVERED")
        .length,
      needsApproval: needs.length,
      needsApprovalPaise: needs.reduce((sum, c) => sum + c.amountPaise, 0),
      expectedRecoveryPaise: cases
        .filter((c) => activeStatuses.has(c.status))
        .reduce((sum, c) => sum + c.expectedRecoverableValuePaise, 0),
      recoveredCount: recovered.length,
      opportunityQueue: cases
        .filter((c) => activeStatuses.has(c.status))
        .slice(0, 4),
      recentActivity: (await this.listAuditEvents()).slice(0, 5),
      pulse: [...pulseMap.values()].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      effectiveness: [...strategyMap].map(([strategy, recovered]) => ({
        strategy: strategy.replaceAll("_", " "),
        recovered,
      })),
    };
  }

  async saveEvaluation(result: EvaluationResult) {
    const summary = {
      id: `eval_${Date.now()}`,
      seed: result.seed,
      caseCount: result.caseCount,
      revenueAtRiskPaise: result.revenueAtRiskPaise,
      baselineRecoveredPaise: result.baseline.recoveredPaise,
      pulseBackRecoveredPaise: result.pulseBack.recoveredPaise,
      createdAt: nowIso(),
    };
    this.evaluations.unshift(summary);
    return { ...summary };
  }
  async listEvaluationRuns(limit = 5) {
    return structuredClone(this.evaluations.slice(0, limit));
  }

  private timeline(
    recovery: RecoveryCase,
    actor: TimelineEvent["actor"],
    title: string,
    kind: TimelineEvent["kind"],
    description?: string,
  ) {
    const event: TimelineEvent = {
      id: `tl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      time: nowIso(),
      actor,
      title,
      kind,
      description,
    };
    recovery.timeline.push(event);
    return event;
  }
  private audit(
    caseId: string | undefined,
    category: string,
    eventType: string,
    actor: string,
    message: string,
    metadata: unknown,
  ) {
    this.audits.unshift({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: nowIso(),
      actor,
      caseId: caseId ?? "—",
      event: eventType.replaceAll("_", " "),
      outcome: eventType.includes("FAILED") ? "Needs review" : "Recorded",
      message,
      metadata,
    });
  }
}
