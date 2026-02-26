import { createServiceClient } from "@/lib/supabase";
import { formatMrr, formatDate, timeAgo } from "@/lib/format";
import { StatusBadge, PlanBadge, RoleBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: company } = await supabase
    .from("companies")
    .select("*, subscriptions(*)")
    .eq("id", id)
    .single();

  if (!company) notFound();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", id)
    .order("last_name");

  const sub = Array.isArray(company.subscriptions)
    ? company.subscriptions[0]
    : company.subscriptions;

  return (
    <>
      <div className="mb-6">
        <Link
          href="/companies"
          className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block"
        >
          ← Companies
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
        <p className="text-muted-foreground capitalize">
          {company.industry?.replace("_", " ")} · {company.employee_count?.toLocaleString()} employees
        </p>
      </div>

      {sub && (
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Plan</p>
                <PlanBadge plan={sub.plan_tier} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <StatusBadge status={sub.status} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Billing</p>
                <p className="text-sm font-medium capitalize">{sub.billing_cycle}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">MRR</p>
                <p className="text-sm font-medium">{formatMrr(company.mrr || 0)}</p>
              </div>
              {sub.renewal_date && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Renewal</p>
                  <p className="text-sm font-medium">{formatDate(sub.renewal_date)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <h2 className="text-lg font-semibold mb-4">
        Contacts ({contacts?.length ?? 0})
      </h2>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts?.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell>
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="font-medium hover:underline"
                  >
                    {contact.first_name} {contact.last_name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {contact.email}
                </TableCell>
                <TableCell>
                  {contact.role && <RoleBadge role={contact.role} />}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {contact.last_active_at ? timeAgo(contact.last_active_at) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
