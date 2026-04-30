import { NextRequest, NextResponse } from 'next/server';

export function validateApiKey(request: NextRequest): {
  valid: boolean;
  response?: NextResponse;
} {
  // Read on each call rather than at module load, so deploys that rotate
  // INTERCOM_CONNECTOR_API_KEY pick up the new value without a cold start.
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
