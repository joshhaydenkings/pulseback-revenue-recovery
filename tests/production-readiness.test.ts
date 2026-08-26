import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveDatabaseRuntimeConfiguration,
  retryDatabaseRead,
} from '../lib/db/prisma';
import {
  absoluteSiteUrl,
  getSiteUrl,
  publicSiteUrlConfigured,
  razorpayWebhookUrl,
} from '../lib/site-url';
import { redactSensitiveText } from '../lib/http/safe-response';
import { consumeRateLimit } from '../lib/security/rate-limit';
import { MockNotificationProvider } from '../lib/notifications/notification-provider';
import { getSystemReadiness } from '../services/readiness-service';
import { GET as runCron } from '../app/api/cron/recovery/route';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hosted production readiness', () => {
  it('selects a generic Node PostgreSQL runtime explicitly', () => {
    const configuration = resolveDatabaseRuntimeConfiguration({
      DATABASE_URL: 'postgresql://example.invalid/pulseback',
      DATABASE_DRIVER: 'pg',
      DATABASE_RUNTIME: 'node',
    });
    expect(configuration).toMatchObject({
      configured: true,
      driver: 'pg',
      runtime: 'node',
    });
  });

  it('selects the serverless Neon runtime from a Neon URL', () => {
    const configuration = resolveDatabaseRuntimeConfiguration({
      DATABASE_URL: 'postgresql://example.neon.tech/pulseback',
    });
    expect(configuration).toMatchObject({
      configured: true,
      driver: 'neon',
      runtime: 'workerd',
    });
  });

  it('rejects a raw TCP driver in the workerd runtime', () => {
    expect(() =>
      resolveDatabaseRuntimeConfiguration({
        DATABASE_URL: 'postgresql://example.invalid/pulseback',
        DATABASE_DRIVER: 'pg',
        DATABASE_RUNTIME: 'workerd',
      }),
    ).toThrow('requires DATABASE_DRIVER=neon');
  });

  it('retries one transient read without replaying writes', async () => {
    let attempts = 0;
    const result = await retryDatabaseRead(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error('Server has closed the connection.'), {
          code: 'P1017',
        });
      }
      return 'connected';
    });
    expect(result).toBe('connected');
    expect(attempts).toBe(2);
  });

  it('normalizes the canonical site origin and builds public links', () => {
    const environment = {
      NEXT_PUBLIC_SITE_URL: 'https://pulseback.example.com/ignored/path/',
    };
    expect(getSiteUrl(environment).toString()).toBe(
      'https://pulseback.example.com/',
    );
    expect(absoluteSiteUrl('/recoveries/demo', environment)).toBe(
      'https://pulseback.example.com/recoveries/demo',
    );
    expect(razorpayWebhookUrl(environment)).toBe(
      'https://pulseback.example.com/api/webhooks/razorpay',
    );
    expect(publicSiteUrlConfigured(environment)).toBe(true);
    expect(
      publicSiteUrlConfigured({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }),
    ).toBe(false);
  });

  it('redacts credentials from server diagnostics', () => {
    const source =
      'postgresql://admin:secret@db.example/pulseback Bearer abc.def gsk_example_secret rzp_live_example';
    const redacted = redactSensitiveText(source);
    expect(redacted).not.toContain('secret');
    expect(redacted).not.toContain('abc.def');
    expect(redacted).not.toContain('rzp_live_example');
    expect(redacted).toContain('[REDACTED]');
  });

  it('enforces fixed-window limits without external infrastructure in demo mode', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const identity = `test-${crypto.randomUUID()}`;
    const rule = { scope: 'test', limit: 2, windowMs: 60_000 };
    expect((await consumeRateLimit(identity, rule)).allowed).toBe(true);
    expect((await consumeRateLimit(identity, rule)).allowed).toBe(true);
    expect((await consumeRateLimit(identity, rule)).allowed).toBe(false);
  });

  it('returns safe readiness data without configured secrets', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://pulseback.example.com');
    vi.stubEnv('AI_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'gsk_do_not_expose');
    vi.stubEnv('GROQ_MODEL', 'openai/gpt-oss-20b');
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_safe_public_id');
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'rzp_test_safe_public_id');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'razorpay_private_secret');
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'webhook_private_secret');
    const serialized = JSON.stringify(await getSystemReadiness());
    expect(serialized).not.toContain('gsk_do_not_expose');
    expect(serialized).not.toContain('razorpay_private_secret');
    expect(serialized).not.toContain('webhook_private_secret');
    expect(serialized).not.toContain('DATABASE_URL');
  });

  it('keeps email delivery explicitly simulated behind a provider interface', async () => {
    const delivery = await new MockNotificationProvider().sendRecoveryEmail({
      recoveryCaseId: 'case_demo',
      customer: { name: 'Demo Customer', email: 'demo@example.com' },
      amountPaise: 499_900,
    });
    expect(delivery).toEqual({
      id: 'email_demo_case_demo',
      status: 'simulated',
      simulated: true,
    });
  });

  it('fails closed when cron authentication is missing or invalid', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(
      (await runCron(new Request('https://pulseback.example/api/cron/recovery')))
        .status,
    ).toBe(503);
    vi.stubEnv('CRON_SECRET', 'expected-secret');
    expect(
      (
        await runCron(
          new Request('https://pulseback.example/api/cron/recovery', {
            headers: { authorization: 'Bearer wrong-secret' },
          }),
        )
      ).status,
    ).toBe(401);
  });
});
