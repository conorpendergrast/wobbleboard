import { Badge } from "@/components/ui/badge";

const statusStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  trial: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  past_due: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  churned: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const planStyles: Record<string, string> = {
  starter: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  growth: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  enterprise: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
};

const roleStyles: Record<string, string> = {
  hr_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  wellness_champion: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  employee: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={statusStyles[status] || ""}>
      {status.replace("_", " ")}
    </Badge>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  return (
    <Badge variant="secondary" className={planStyles[plan] || ""}>
      {plan}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="secondary" className={roleStyles[role] || ""}>
      {role.replace("_", " ")}
    </Badge>
  );
}
