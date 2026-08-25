import OpenAI from "openai";

export type HostedAIProvider = "GROQ" | "OPENAI";

const DEFAULT_PROVIDER: HostedAIProvider = "GROQ";
const DEFAULT_MODELS: Record<HostedAIProvider, string> = {
  GROQ: "openai/gpt-oss-20b",
  OPENAI: "gpt-5-mini",
};
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const AI_TIMEOUT_MS = 4_500;

const clients = new Map<HostedAIProvider, OpenAI>();

export function configuredAIProvider(
  env: NodeJS.ProcessEnv = process.env,
): HostedAIProvider {
  const explicit = env.AI_PROVIDER?.trim().toUpperCase();
  if (explicit === "OPENAI" || explicit === "GROQ") return explicit;
  if (env.GROQ_API_KEY?.trim()) return "GROQ";
  if (env.OPENAI_API_KEY?.trim()) return "OPENAI";
  return DEFAULT_PROVIDER;
}

export function configuredAIModel(
  provider = configuredAIProvider(),
  env: NodeJS.ProcessEnv = process.env,
) {
  return (
    (provider === "GROQ" ? env.GROQ_MODEL : env.OPENAI_MODEL)?.trim() ||
    DEFAULT_MODELS[provider]
  );
}

export function aiProviderConfigured(
  provider = configuredAIProvider(),
  env: NodeJS.ProcessEnv = process.env,
) {
  return Boolean(
    (provider === "GROQ" ? env.GROQ_API_KEY : env.OPENAI_API_KEY)?.trim(),
  );
}

export function aiProviderKeyName(provider = configuredAIProvider()) {
  return provider === "GROQ" ? "GROQ_API_KEY" : "OPENAI_API_KEY";
}

export function getHostedAIClient(provider = configuredAIProvider()) {
  if (typeof window !== "undefined")
    throw new Error("Hosted AI client is server-only");
  if (!aiProviderConfigured(provider))
    throw new Error(`${aiProviderKeyName(provider)} is not configured`);
  const existing = clients.get(provider);
  if (existing) return existing;
  const client = new OpenAI({
    apiKey:
      provider === "GROQ"
        ? process.env.GROQ_API_KEY
        : process.env.OPENAI_API_KEY,
    baseURL: provider === "GROQ" ? GROQ_BASE_URL : undefined,
    timeout: AI_TIMEOUT_MS,
    maxRetries: 0,
  });
  clients.set(provider, client);
  return client;
}

export function hostedAIProviderName(provider: HostedAIProvider) {
  return provider === "GROQ" ? "Groq" : "OpenAI";
}

export const aiRequestTimeoutMs = AI_TIMEOUT_MS;
