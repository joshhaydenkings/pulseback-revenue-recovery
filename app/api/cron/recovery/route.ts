import { safeErrorResponse } from '../../../../lib/http/safe-response';
import { pruneExpiredRateLimits } from '../../../../lib/security/rate-limit';
import { getRecoveryRepository } from '../../../../repositories/recovery-repository';

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { error: 'Cron processing is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  try {
    const repository = getRecoveryRepository();
    await pruneExpiredRateLimits();
    return Response.json({
      ok: true,
      ...(await repository.processDueActions()),
      storage: repository.kind,
    });
  } catch (error) {
    return safeErrorResponse(
      'cron-recovery',
      error,
      'Unable to process due recovery actions',
    );
  }
}

export const POST = handle;
export const GET = handle;
