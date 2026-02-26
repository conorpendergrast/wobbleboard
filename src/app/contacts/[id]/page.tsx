import { createServiceClient } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import { RoleBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*, companies(id, name)")
    .eq("id", id)
    .single();

  if (!contact) notFound();

  const { data: events } = await supabase
    .from("product_events")
    .select("*")
    .eq("contact_id", id)
    .order("timestamp", { ascending: false })
    .limit(50);

  const company = contact.companies as unknown as { id: string; name: string };

  return (
    <>
      <div className="mb-6">
        <Link
          href="/contacts"
          className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block"
        >
          ← Contacts
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          {contact.first_name} {contact.last_name}
        </h1>
        <p className="text-muted-foreground">
          {contact.email}
        </p>
        <div className="flex items-center gap-3 mt-2">
          {contact.role && <RoleBadge role={contact.role} />}
          <Link
            href={`/companies/${company?.id}`}
            className="text-sm hover:underline"
          >
            {company?.name}
          </Link>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-4">
        Events ({events?.length ?? 0})
      </h2>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Metadata</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events?.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="font-medium">
                  {event.event_name.replace(/_/g, " ")}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs font-mono">
                  {event.metadata &&
                  Object.keys(event.metadata as Record<string, unknown>).length > 0
                    ? Object.entries(event.metadata as Record<string, unknown>)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ")
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {timeAgo(event.timestamp)}
                </TableCell>
              </TableRow>
            ))}
            {(!events || events.length === 0) && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  No events recorded
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
