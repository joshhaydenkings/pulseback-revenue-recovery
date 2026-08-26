import { createHash } from 'node:crypto';
import { databaseConfigured, getPrisma } from '../db/prisma';

export interface RateLimitRule {
  scope: string;
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

interface RateLimitStore {
  consume(
    key: string,
    identityHash: string,
    rule: RateLimitRule,
    now: Date,
  ): Promise<RateLimitResult>;
}

declare global {
  var __pulseBackRateLimits: Map<string, { count: number; expiresAt: number }> | undefined;
}

const memoryBuckets = globalThis.__pulseBackRateLimits ??= new Map();

export const publicMutationLimits = {
  demoScenario: { scope: 'demo-scenario', limit: 20, windowMs: 60_000 },
  demoEvent: { scope: 'demo-event', limit: 30, windowMs: 60_000 },
  demoAI: { scope: 'demo-ai', limit: 6, windowMs: 60_000 },
  recoveryAction: { scope: 'recovery-action', limit: 30, windowMs: 60_000 },
  recoveryReanalysis: { scope: 'recovery-reanalysis', limit: 8, windowMs: 60_000 },
  razorpayOrder: { scope: 'razorpay-order', limit: 10, windowMs: 60_000 },
  razorpayVerify: { scope: 'razorpay-verify', limit: 20, windowMs: 60_000 },
  policyMutation: { scope: 'policy-mutation', limit: 10, windowMs: 60_000 },
  evaluation: { scope: 'evaluation', limit: 6, windowMs: 60_000 },
  demoDueActions: { scope: 'demo-due-actions', limit: 6, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

const memoryStore: RateLimitStore = {
  async consume(key, _identityHash, rule, now) {
    const current = memoryBuckets.get(key);
    const count = !current || current.expiresAt <= now.getTime() ? 1 : current.count + 1;
    const expiresAt = !current || current.expiresAt <= now.getTime()
      ? now.getTime() + rule.windowMs
      : current.expiresAt;
    memoryBuckets.set(key, { count, expiresAt });
    return {
      allowed: count <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetAt: new Date(expiresAt),
    };
  },
};

const databaseStore: RateLimitStore = {
  async consume(key, identityHash, rule, now) {
    const prisma = await getPrisma();
    const windowStart = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
    const expiresAt = new Date(windowStart.getTime() + rule.windowMs * 2);
    const row = await prisma.rateLimitBucket.upsert({
      where: { id: key },
      create: {
        id: key,
        scope: rule.scope,
        identityHash,
        windowStart,
        expiresAt,
      },
      update: { count: { increment: 1 }, expiresAt },
      select: { count: true },
    });
    return {
      allowed: row.count <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - row.count),
      resetAt: new Date(windowStart.getTime() + rule.windowMs),
    };
  },
};

function requestIdentity(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'local-demo'
  );
}

function bucketKey(identityHash: string, rule: RateLimitRule, now: Date) {
  const windowStart = Math.floor(now.getTime() / rule.windowMs) * rule.windowMs;
  return createHash('sha256')
    .update(`${rule.scope}:${identityHash}:${windowStart}`)
    .digest('hex');
}

export async function consumeRateLimit(
  identity: string,
  rule: RateLimitRule,
  now = new Date(),
  store: RateLimitStore = databaseConfigured() ? databaseStore : memoryStore,
) {
  const identityHash = createHash('sha256').update(identity).digest('hex');
  return store.consume(bucketKey(identityHash, rule, now), identityHash, rule, now);
}

export async function enforceRateLimit(request: Request, rule: RateLimitRule) {
  try {
    const result = await consumeRateLimit(requestIdentity(request), rule);
    if (result.allowed) return null;
    const retryAfter = Math.max(
      1,
      Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
    );
    return Response.json(
      { error: 'Too many requests. Please try again shortly.' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(retryAfter),
          'RateLimit-Limit': String(result.limit),
          'RateLimit-Remaining': String(result.remaining),
        },
      },
    );
  } catch (error) {
    console.error('[PulseBack:rate-limit]', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return Response.json(
      { error: 'Request protection is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function pruneExpiredRateLimits(now = new Date()) {
  if (!databaseConfigured()) return 0;
  const prisma = await getPrisma();
  const result = await prisma.rateLimitBucket.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}
