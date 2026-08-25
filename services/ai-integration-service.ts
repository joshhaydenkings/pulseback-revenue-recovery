import {
  aiProviderConfigured,
  aiProviderKeyName,
  configuredAIModel,
  configuredAIProvider,
  hostedAIProviderName,
  type HostedAIProvider,
} from "../lib/ai/ai-provider-client";
import { databaseConfigured, getPrisma } from "../lib/db/prisma";

export interface AIIntegrationStatus {
  provider: "Groq" | "OpenAI" | "Deterministic Recovery Engine";
  configuredProvider: HostedAIProvider;
  status: "connected" | "not-configured" | "degraded";
  model: string;
  fallbackEnabled: true;
  recentAIDecisions: number;
  fallbackDecisions: number;
  lastSuccessfulAIDecision?: string;
  requiredEnvironment: string[];
}

export async function getAIIntegrationStatus(): Promise<AIIntegrationStatus> {
  const configuredProvider = configuredAIProvider();
  const configured = aiProviderConfigured(configuredProvider);
  const model = configuredAIModel(configuredProvider);
  const provider: AIIntegrationStatus["provider"] = configured
      ? hostedAIProviderName(configuredProvider)
      : "Deterministic Recovery Engine";
  const base = {
    provider,
    configuredProvider,
    model,
    fallbackEnabled: true as const,
    requiredEnvironment: [
      "AI_PROVIDER",
      aiProviderKeyName(configuredProvider),
      configuredProvider === "GROQ" ? "GROQ_MODEL" : "OPENAI_MODEL",
    ],
  };
  if (!databaseConfigured())
    return {
      ...base,
      status: configured ? "connected" : "not-configured",
      recentAIDecisions: 0,
      fallbackDecisions: 0,
    };
  const prisma = await getPrisma();
  const [recentAIDecisions, fallbackDecisions, lastSuccess, lastFallback] =
    await Promise.all([
      prisma.recoveryDecision.count({
        where: { decisionProvider: configuredProvider },
      }),
      prisma.recoveryDecision.count({
        where: { fallbackReason: { not: null }, model },
      }),
      prisma.recoveryDecision.findFirst({
        where: { decisionProvider: configuredProvider },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.recoveryDecision.findFirst({
        where: { fallbackReason: { not: null }, model },
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
    ...base,
    status: configured ? (degraded ? "degraded" : "connected") : "not-configured",
    recentAIDecisions,
    fallbackDecisions,
    lastSuccessfulAIDecision: lastSuccess?.createdAt.toISOString(),
  };
}
