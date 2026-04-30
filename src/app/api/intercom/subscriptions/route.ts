// Subscriptions Data Connector route.
//
// GET — read a company's subscription state.
// POST — Phase 3d.1: mutate plan_tier or status (cancel) on behalf of Fin.
//
// POST notes for future contributors:
//   * 409 and 415 are deliberate. Existing GET endpoints don't use them; this
//     route does because mutation introduces conflict (already-churned cancel,
//     concurrent state change) and content-negotiation (non-JSON body) cases
//     that the GETs can't hit.
//   * Supabase is the source of truth. After Supabase commits, we push attribute
//     updates to Intercom on a best-effort basis (5s timeout). If Intercom
//     fails, we log and return a 200 partial-success response — the next
//     `npm run sync:intercom` reconciles. Do NOT add a Supabase rollback path.
//   * Idempotency: change_plan to current tier is a no-op (200, no writes).
//     cancel on an already-churned row is a 409. Both are state-setting, so
//     Fin retries are safe by construction; no idempotency key needed.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateApiKey } from '@/lib/api-auth';
import { intercomRequest } from '@/lib/intercom';

const PLAN_TIERS = ['starter', 'growth', 'enterprise'] as const;
const ACTIONS = ['change_plan', 'cancel'] as const;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTERCOM_PUSH_TIMEOUT_MS = 5000;

type PlanTier = (typeof PLAN_TIERS)[number];
type Action = (typeof ACTIONS)[number];

export async function GET(request: NextRequest) {
  const authValidation = validateApiKey(request);
  if (!authValidation.valid) {
    return authValidation.response!;
  }

  const companyId = request.nextUrl.searchParams.get('company_id');
  if (!companyId) {
    return NextResponse.json({ error: 'company_id query parameter is required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan_tier, status, billing_cycle, renewal_date, companies(name)')
    .eq('company_id', companyId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'No subscription found for this company' }, { status: 404 });
  }

  return NextResponse.json({
    company_name: extractCompanyName(data.companies),
    subscription: {
      plan_tier: data.plan_tier,
      status: data.status,
      billing_cycle: data.billing_cycle,
      renewal_date: data.renewal_date,
    },
  });
}

export async function POST(request: NextRequest) {
  const authValidation = validateApiKey(request);
  if (!authValidation.valid) {
    return authValidation.response!;
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = validateBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { company_id, action, new_plan_tier } = validation.value;

  const supabase = createServiceClient();

  const { data: existing, error: readErr } = await supabase
    .from('subscriptions')
    .select('plan_tier, status, billing_cycle, renewal_date, companies(name)')
    .eq('company_id', company_id)
    .single();

  if (readErr || !existing) {
    return NextResponse.json(
      { error: 'No subscription found for this company' },
      { status: 404 }
    );
  }

  const companyName = extractCompanyName(existing.companies);

  // Pre-flight conflicts.
  if (action === 'cancel' && existing.status === 'churned') {
    return NextResponse.json(
      { error: 'Subscription is already cancelled' },
      { status: 409 }
    );
  }
  if (action === 'change_plan' && existing.plan_tier === new_plan_tier) {
    // No-op: idempotent success without any writes.
    return NextResponse.json({
      supabase_updated: false,
      intercom_synced: true,
      message: `Already on ${new_plan_tier} plan; no change made.`,
      company_name: companyName,
      subscription: {
        plan_tier: existing.plan_tier,
        status: existing.status,
        billing_cycle: existing.billing_cycle,
        renewal_date: existing.renewal_date,
      },
    });
  }

  const patch: Record<string, string> =
    action === 'change_plan'
      ? { plan_tier: new_plan_tier! }
      : { status: 'churned' };

  // Status-guarded UPDATE: a concurrent cancel landing between SELECT and
  // UPDATE would otherwise let change_plan clobber a churned row's plan_tier.
  const { data: updated, error: updateErr } = await supabase
    .from('subscriptions')
    .update(patch)
    .eq('company_id', company_id)
    .neq('status', 'churned')
    .select('plan_tier, status, billing_cycle, renewal_date')
    .single();

  if (updateErr) {
    if ((updateErr as { code?: string }).code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Subscription state changed concurrently; please retry' },
        { status: 409 }
      );
    }
    console.error('Failed to update subscription:', updateErr);
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    );
  }

  // Best-effort Intercom push with a hard timeout. Failure here does NOT roll
  // back the Supabase write — `npm run sync:intercom` reconciles drift.
  let intercomSynced = true;
  let intercomError: string | undefined;
  try {
    await pushToIntercomWithTimeout(company_id, updated.plan_tier, updated.status);
  } catch (err) {
    intercomSynced = false;
    intercomError = (err as Error).message;
    console.error('Intercom push failed (Supabase write retained):', err);
  }

  const message =
    action === 'change_plan'
      ? intercomSynced
        ? `Plan changed to ${updated.plan_tier}.`
        : `Plan changed to ${updated.plan_tier}. Update will appear in Intercom shortly.`
      : intercomSynced
        ? 'Subscription cancelled.'
        : 'Subscription cancelled. Update will appear in Intercom shortly.';

  return NextResponse.json({
    supabase_updated: true,
    intercom_synced: intercomSynced,
    ...(intercomError ? { intercom_error: intercomError } : {}),
    message,
    company_name: companyName,
    subscription: {
      plan_tier: updated.plan_tier,
      status: updated.status,
      billing_cycle: updated.billing_cycle,
      renewal_date: updated.renewal_date,
    },
  });
}

type ValidatedBody = {
  company_id: string;
  action: Action;
  new_plan_tier?: PlanTier;
};

function validateBody(
  body: unknown
): { ok: true; value: ValidatedBody } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;

  if (!b.company_id) {
    return { ok: false, error: 'company_id is required' };
  }
  if (typeof b.company_id !== 'string' || !UUID_REGEX.test(b.company_id)) {
    return { ok: false, error: 'company_id must be a valid UUID' };
  }

  if (!b.action || !ACTIONS.includes(b.action as Action)) {
    return { ok: false, error: "action must be 'change_plan' or 'cancel'" };
  }

  if (b.action === 'change_plan') {
    if (!b.new_plan_tier) {
      return {
        ok: false,
        error: 'new_plan_tier is required when action is change_plan',
      };
    }
    if (!PLAN_TIERS.includes(b.new_plan_tier as PlanTier)) {
      return {
        ok: false,
        error: `new_plan_tier must be one of: ${PLAN_TIERS.join(', ')}`,
      };
    }
  }

  return {
    ok: true,
    value: {
      company_id: b.company_id,
      action: b.action as Action,
      new_plan_tier:
        b.action === 'change_plan' ? (b.new_plan_tier as PlanTier) : undefined,
    },
  };
}

// Supabase returns the joined `companies(name)` as either a single object or
// an array depending on the relationship — accept both shapes defensively.
function extractCompanyName(
  companies: { name?: string } | { name?: string }[] | null | undefined
): string {
  if (!companies) return 'Unknown';
  const obj = Array.isArray(companies) ? companies[0] : companies;
  return obj?.name ?? 'Unknown';
}

async function pushToIntercomWithTimeout(
  companyId: string,
  planTier: string,
  status: string
): Promise<void> {
  await Promise.race([
    intercomRequest('POST', '/companies', {
      company_id: companyId,
      custom_attributes: {
        plan_tier: planTier,
        subscription_status: status,
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Intercom push timed out after ${INTERCOM_PUSH_TIMEOUT_MS}ms`)),
        INTERCOM_PUSH_TIMEOUT_MS
      )
    ),
  ]);
}
