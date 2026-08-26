import { getSystemReadiness } from '../../../services/readiness-service';
import { safeErrorResponse } from '../../../lib/http/safe-response';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const readiness = await getSystemReadiness();
    return Response.json(readiness, {
      status: readiness.status === 'ready' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return safeErrorResponse(
      'health',
      error,
      'Readiness status is temporarily unavailable',
      503,
    );
  }
}
