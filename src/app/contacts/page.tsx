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

export default async function ContactsPage() {
  const supabase = createServiceClient();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("*, companies(id, name)")
    .order("last_name");

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Contacts</h1>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts?.map((contact) => {
              const company = contact.companies as unknown as {
                id: string;
                name: string;
              };
              return (
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
                    <Link
                      href={`/companies/${company?.id}`}
                      className="hover:underline"
                    >
                      {company?.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {contact.role && <RoleBadge role={contact.role} />}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {contact.last_active_at
                      ? timeAgo(contact.last_active_at)
                      : "—"}
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
