import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.INTERCOM_CONNECTOR_API_KEY;

export function validateApiKey(request: NextRequest): {
  valid: boolean;
  response?: NextResponse;
} {
  const authHeader = request.headers.get('authorization');

  if (!API_KEY || authHeader !== `Bearer ${API_KEY}`) {
    return {
      valid: false,
      response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }),
    };
  }

  return { valid: true };
}
