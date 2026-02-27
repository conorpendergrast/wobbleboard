import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateApiKey } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const authValidation = validateApiKey(request);
  if (!authValidation.valid) {
    return authValidation.response!;
  }

  const email = request.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email query parameter is required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Get contact by email
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, role, last_active_at, company_id')
    .eq('email', email)
    .single();

  if (contactError || !contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  // Get company name
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('name')
    .eq('id', contact.company_id)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: 'Company not found for contact' }, { status: 404 });
  }

  // Get total event count for this contact
  const { count: totalEvents, error: countError } = await supabase
    .from('product_events')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contact.id);

  if (countError) {
    console.error('Failed to count events:', countError);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }

  // Get last 10 product events
  const { data: events, error: eventsError } = await supabase
    .from('product_events')
    .select('event_name, timestamp, metadata')
    .eq('contact_id', contact.id)
    .order('timestamp', { ascending: false })
    .limit(10);

  if (eventsError) {
    console.error('Failed to fetch events:', eventsError);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }

  return NextResponse.json({
    contact_name: `${contact.first_name} ${contact.last_name}`,
    company_name: company.name,
    role: contact.role,
    last_active_at: contact.last_active_at,
    total_events: totalEvents ?? 0,
    recent_events: events || [],
  });
}
