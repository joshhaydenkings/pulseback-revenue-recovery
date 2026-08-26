const SECRET_PATTERNS = [
  /postgres(?:ql)?:\/\/[^\s]+/gi,
  /(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.:-]+/gi,
  /\b(?:gsk|sk|rzp_(?:test|live))_[A-Za-z0-9_-]+\b/gi,
];

export function redactSensitiveText(value: string) {
  return SECRET_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, '[REDACTED]'),
    value,
  );
}

function safeDiagnostic(error: unknown) {
  if (!(error instanceof Error)) return { type: typeof error };
  const withCode = error as Error & { code?: unknown; status?: unknown };
  return {
    name: error.name,
    message: redactSensitiveText(error.message).slice(0, 500),
    code: typeof withCode.code === 'string' ? withCode.code : undefined,
    status: typeof withCode.status === 'number' ? withCode.status : undefined,
  };
}

export function safeErrorResponse(
  context: string,
  error: unknown,
  clientMessage: string,
  status = 500,
) {
  console.error(`[PulseBack:${context}]`, safeDiagnostic(error));
  return Response.json(
    { error: clientMessage },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function invalidRequestResponse(message = 'Invalid request') {
  return Response.json(
    { error: message },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  );
}
