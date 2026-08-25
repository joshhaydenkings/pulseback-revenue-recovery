import {
  configuredOpenAIModel,
  openAIConfigured,
} from "../lib/ai/openai-client";
import { databaseConfigured, getPrisma } from "../lib/db/prisma";

export interface AIIntegrationStatus {
  provider: "OpenAI" | "Deterministic Recovery Engine";
  status: "connected" | "not-configured" | "degraded";
  model?: string;
  fallbackEnabled: true;
  recentAIDecisions: number;
  fallbackDecisions: number;
  lastSuccessfulAIDecision?: string;
}

export async function getAIIntegrationStatus(): Promise<AIIntegrationStatus> {
  const configured = openAIConfigured();
  if (!databaseConfigured())
    return {
      provider: configured ? "OpenAI" : "Deterministic Recovery Engine",
      status: configured ? "connected" : "not-configured",
      model: configured ? configuredOpenAIModel() : undefined,
      fallbackEnabled: true,
      recentAIDecisions: 0,
      fallbackDecisions: 0,
    };
  const prisma = await getPrisma();
  const [recentAIDecisions, fallbackDecisions, lastSuccess, lastFallback] =
    await Promise.all([
      prisma.recoveryDecision.count({
        where: { decisionProvider: "OPENAI" },
      }),
      prisma.recoveryDecision.count({
        where: { fallbackReason: { not: null } },
      }),
      prisma.recoveryDecision.findFirst({
        where: { decisionProvider: "OPENAI" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.recoveryDecision.findFirst({
        where: { fallbackReason: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);
  const degraded = Boolean(
    configured &&
      lastFallback &&
      (!lastSuccess || lastFallback.createdAt > lastSuccess.createdAt),
  );
  return {
    provider: configured ? "OpenAI" : "Deterministic Recovery Engine",
    status: configured ? (degraded ? "degraded" : "connected") : "not-configured",
    model: configured ? configuredOpenAIModel() : undefined,
    fallbackEnabled: true,
    recentAIDecisions,
    fallbackDecisions,
    lastSuccessfulAIDecision: lastSuccess?.createdAt.toISOString(),
  };
}
