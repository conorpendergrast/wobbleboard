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

  // Get company
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Get total contacts at company
  const { count: totalContacts, error: totalContactsError } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if (totalContactsError) {
    console.error('Failed to count total contacts:', totalContactsError);
    return NextResponse.json({ error: 'Failed to fetch company stats' }, { status: 500 });
  }

  // Get contacts active in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

  const { count: activeContacts, error: activeContactsError } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gt('last_active_at', thirtyDaysAgoIso);

  if (activeContactsError) {
    console.error('Failed to count active contacts:', activeContactsError);
    return NextResponse.json({ error: 'Failed to fetch company stats' }, { status: 500 });
  }

  // Get company contact IDs (needed for events queries)
  const { data: companyContacts, error: companyContactsError } = await supabase
    .from('contacts')
    .select('id')
    .eq('company_id', companyId);

  if (companyContactsError || !companyContacts) {
    console.error('Failed to fetch company contacts:', companyContactsError);
    return NextResponse.json({ error: 'Failed to fetch company stats' }, { status: 500 });
  }

  const contactIds = companyContacts.map(c => c.id);

  if (contactIds.length === 0) {
    // No contacts, return zero stats
    return NextResponse.json({
      company_name: company.name,
      total_contacts: 0,
      active_contacts_30d: 0,
      total_events_30d: 0,
      last_event_at: null,
      top_events: [],
    });
  }

  // Get total events in last 30 days
  const { count: totalEvents, error: totalEventsError } = await supabase
    .from('product_events')
    .select('id', { count: 'exact', head: true })
    .in('contact_id', contactIds)
    .gt('timestamp', thirtyDaysAgoIso);

  if (totalEventsError) {
    console.error('Failed to count events:', totalEventsError);
    return NextResponse.json({ error: 'Failed to fetch company stats' }, { status: 500 });
  }

  // Get most recent event timestamp in last 30 days
  const { data: lastEventData, error: lastEventError } = await supabase
    .from('product_events')
    .select('timestamp')
    .in('contact_id', contactIds)
    .gt('timestamp', thirtyDaysAgoIso)
    .order('timestamp', { ascending: false })
    .limit(1);

  if (lastEventError) {
    console.error('Failed to fetch last event:', lastEventError);
    return NextResponse.json({ error: 'Failed to fetch company stats' }, { status: 500 });
  }

  const lastEventAt = lastEventData && lastEventData.length > 0 ? lastEventData[0].timestamp : null;

  // Get top 3 event types
  const { data: allEvents, error: allEventsError } = await supabase
    .from('product_events')
    .select('event_name')
    .in('contact_id', contactIds)
    .gt('timestamp', thirtyDaysAgoIso);

  if (allEventsError) {
    console.error('Failed to fetch events:', allEventsError);
    return NextResponse.json({ error: 'Failed to fetch company stats' }, { status: 500 });
  }

  // Count event types
  const eventCounts = new Map<string, number>();
  (allEvents || []).forEach(event => {
    const count = eventCounts.get(event.event_name) || 0;
    eventCounts.set(event.event_name, count + 1);
  });

  // Get top 3
  const topEvents = Array.from(eventCounts.entries())
    .map(([event_name, count]) => ({ event_name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return NextResponse.json({
    company_name: company.name,
    total_contacts: totalContacts ?? 0,
    active_contacts_30d: activeContacts ?? 0,
    total_events_30d: totalEvents ?? 0,
    last_event_at: lastEventAt,
    top_events: topEvents,
  });
}
