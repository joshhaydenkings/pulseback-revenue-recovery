import { z } from 'zod';
import { invalidRequestResponse, safeErrorResponse } from '../../../../lib/http/safe-response';
import { enforceRateLimit, publicMutationLimits } from '../../../../lib/security/rate-limit';
import { getRecoveryRepository } from '../../../../repositories/recovery-repository';
import { processRecoveryEvent } from '../../../../services/recovery-event-pipeline';

const schema = z.object({
  scenario: z.enum([
    'authentication',
    'insufficient',
    'late_authorization',
    'high_value',
    'fatigue',
    'payment_link',
    'provider_failure',
    'duplicate_webhook',
    'full_demo',
  ]),
  useLiveAI: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(
    request,
    publicMutationLimits.demoScenario,
  );
  if (limited) return limited;
  try {
    const { scenario, useLiveAI } = schema.parse(await request.json());
    const repository = getRecoveryRepository();
    const base = `scenario_${scenario}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    const type =
      scenario === 'insufficient'
        ? 'insufficient_funds'
        : scenario === 'late_authorization'
          ? 'bank_timeout'
          : scenario === 'high_value'
            ? 'high_value_failure'
            : scenario === 'fatigue'
              ? 'exhausted_contact_limit'
              : 'authentication_failure';
    const failed = await processRecoveryEvent({
      provider: 'SIMULATOR',
      providerEventId: base,
      type,
      amountPaise: scenario === 'high_value' ? 4_200_000 : 499_900,
      providerPaymentId: `pay_${base}`,
      injectProviderFailure: scenario === 'provider_failure',
      useLiveAI,
    });
    let final = failed;
    if (!failed.caseId) throw new Error('Scenario did not create a recovery case');
    if (scenario === 'late_authorization') {
      final = await processRecoveryEvent({
        provider: 'SIMULATOR',
        providerEventId: `${base}_authorized`,
        type: 'late_authorization',
        caseId: failed.caseId,
        providerPaymentId: `pay_${base}`,
      });
    }
    if (scenario === 'payment_link') {
      await repository.runCaseCommand(failed.caseId, 'run');
      final = await processRecoveryEvent({
        provider: 'SIMULATOR',
        providerEventId: `${base}_paid`,
        type: 'payment_link_paid',
        caseId: failed.caseId,
      });
    }
    if (scenario === 'provider_failure') {
      await repository.runCaseCommand(failed.caseId, 'run');
    }
    if (scenario === 'duplicate_webhook') {
      final = await processRecoveryEvent({
        provider: 'SIMULATOR',
        providerEventId: base,
        type: 'authentication_failure',
        amountPaise: 499_900,
        providerPaymentId: `pay_${base}`,
      });
    }
    if (scenario === 'full_demo') {
      await repository.runCaseCommand(failed.caseId, 'run');
      final = await processRecoveryEvent({
        provider: 'SIMULATOR',
        providerEventId: `${base}_paid`,
        type: 'payment_link_paid',
        caseId: failed.caseId,
      });
      await processRecoveryEvent({
        provider: 'SIMULATOR',
        providerEventId: `${base}_high`,
        type: 'high_value_failure',
        amountPaise: 4_200_000,
        useLiveAI,
      });
    }
    return Response.json({
      ...final,
      scenario,
      caseId: failed.caseId,
      simulated: true,
      message:
        scenario === 'provider_failure'
          ? 'Provider failure persisted, duplicate creation was prevented, and the case escalated safely.'
          : scenario === 'duplicate_webhook'
            ? 'The second provider event was recognized from persistent idempotency storage and ignored.'
            : scenario === 'full_demo'
              ? 'Persistent scripted sequence completed across recovery, approval and audit.'
              : final.message,
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequestResponse('Invalid demo scenario');
    }
    return safeErrorResponse(
      'demo-scenario',
      error,
      'Unable to complete the demo scenario',
    );
  }
}
