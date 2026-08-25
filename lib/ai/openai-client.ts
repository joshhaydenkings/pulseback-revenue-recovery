import OpenAI from "openai";

const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const OPENAI_TIMEOUT_MS = 4_500;

let client: OpenAI | undefined;

export function openAIConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

export function configuredOpenAIModel(env: NodeJS.ProcessEnv = process.env) {
  return env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export function getOpenAIClient() {
  if (typeof window !== "undefined")
    throw new Error("OpenAI client is server-only");
  if (!openAIConfigured()) throw new Error("OPENAI_API_KEY is not configured");
  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: 0,
  });
  return client;
}

export const openAIRequestTimeoutMs = OPENAI_TIMEOUT_MS;
