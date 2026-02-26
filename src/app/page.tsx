import { createServiceClient } from "@/lib/supabase";
import { StatCard } from "@/components/stat-card";
import { formatMrr, timeAgo } from "@/lib/format";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = createServiceClient();

  const [
    { count: companyCount },
    { count: contactCount },
    { count: eventCount },
    { data: companies },
    { data: recentEvents },
  ] = await Promise.all([
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("product_events").select("*", { count: "exact", head: true }),
    supabase.from("companies").select("mrr"),
    supabase
      .from("product_events")
      .select("id, event_name, timestamp, contacts(first_name, last_name, company_id, companies(name))")
      .order("timestamp", { ascending: false })
      .limit(10),
  ]);

  const totalMrr = companies?.reduce((sum, c) => sum + (c.mrr || 0), 0) ?? 0;

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard title="Companies" value={companyCount ?? 0} />
        <StatCard title="Contacts" value={contactCount ?? 0} />
        <StatCard title="Events" value={eventCount ?? 0} />
        <StatCard title="Total MRR" value={formatMrr(totalMrr)} />
      </div>

      <h2 className="text-lg font-semibold mb-4">Recent activity</h2>

      <div className="rounded-lg border border-border divide-y divide-border">
        {recentEvents?.map((event) => {
          const contact = event.contacts as unknown as {
            first_name: string;
            last_name: string;
            company_id: string;
            companies: { name: string };
          };
          return (
            <div
              key={event.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {contact?.first_name?.[0]}
                  {contact?.last_name?.[0]}
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {contact?.first_name} {contact?.last_name}
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      — {event.event_name.replace(/_/g, " ")}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {contact?.companies?.name}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {timeAgo(event.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
