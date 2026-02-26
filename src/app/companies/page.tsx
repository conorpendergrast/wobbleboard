import { createServiceClient } from "@/lib/supabase";
import { formatMrr } from "@/lib/format";
import { StatusBadge, PlanBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

export default async function CompaniesPage() {
  const supabase = createServiceClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("*, subscriptions(plan_tier, status, billing_cycle)")
    .order("name");

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Companies</h1>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Employees</TableHead>
              <TableHead className="text-right">MRR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies?.map((company) => {
              const sub = Array.isArray(company.subscriptions)
                ? company.subscriptions[0]
                : company.subscriptions;
              return (
                <TableRow key={company.id}>
                  <TableCell>
                    <Link
                      href={`/companies/${company.id}`}
                      className="font-medium hover:underline"
                    >
                      {company.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {company.industry?.replace("_", " ")}
                  </TableCell>
                  <TableCell>
                    {sub?.plan_tier && <PlanBadge plan={sub.plan_tier} />}
                  </TableCell>
                  <TableCell>
                    {sub?.status && <StatusBadge status={sub.status} />}
                  </TableCell>
                  <TableCell className="text-right">
                    {company.employee_count?.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMrr(company.mrr || 0)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
