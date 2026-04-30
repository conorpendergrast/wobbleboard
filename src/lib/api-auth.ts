import { NextRequest, NextResponse } from 'next/server';

export function validateApiKey(request: NextRequest): {
  valid: boolean;
  response?: NextResponse;
} {
  // Read on each call so tests can override, and so an empty/unset env var
  // is treated as "no key configured" → 401 rather than silently matching.
  const apiKey = process.env.INTERCOM_CONNECTOR_API_KEY;
  const authHeader = request.headers.get('authorization');

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return {
      valid: false,
      response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }),
    };
  }

  return { valid: true };
}
