import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateApiKey } from '@/lib/api-auth';

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
    company_name: (data.companies as any)?.name ?? 'Unknown',
    subscription: {
      plan_tier: data.plan_tier,
      status: data.status,
      billing_cycle: data.billing_cycle,
      renewal_date: data.renewal_date,
    },
  });
}
