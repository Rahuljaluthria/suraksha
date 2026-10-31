import { useAppSelector } from "@/app/hooks";
import { Link } from "react-router-dom";
import {
  Shield,
  KeyRound,
  AlertTriangle,
  FileText,
  Settings,
  Lock,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const { user } = useAppSelector((state) => state.auth);

  if (!user) return null;

  const isAdmin = user.roles.includes("ADMIN");
  const isAuditor = user.roles.includes("AUDITOR");

  return (
    <div className="space-y-6">
      {/* User Overview Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-card p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Welcome, {user.firstName} {user.lastName}
            </h1>
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary border border-primary/20">
              {user.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{user.email}</p>
        </div>

        {/* Roles Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {user.roles.map((role) => (
            <span
              key={role}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-xs font-mono font-medium text-secondary-foreground border border-border"
            >
              <Shield className="size-3 text-primary" />
              {role}
            </span>
          ))}
        </div>
      </div>

      {/* Security Operational Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Incident Management */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-foreground font-medium text-sm">
            <AlertTriangle className="size-4 text-primary" />
            Incident Reporting
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Report anomalous security behavior, breach alerts, and system warnings directly to the SOC.
          </p>
          <div className="pt-2">
            <Button size="sm" variant="outline" className="w-full justify-start text-xs">
              + Report Incident
            </Button>
          </div>
        </div>

        {/* Telemetry & Audit */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-foreground font-medium text-sm">
            <FileText className="size-4 text-primary" />
            Audit & Compliance
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isAuditor
              ? "Read-only access to historical security audit logs and compliance records."
              : "Review activity logs and compliance benchmarks for reported incidents."}
          </p>
          <div className="pt-2">
            <Button size="sm" variant="outline" className="w-full justify-start text-xs">
              View Activity Logs
            </Button>
          </div>
        </div>

        {/* Admin Management (Role-Gated Link) */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-foreground font-medium text-sm">
            <Settings className="size-4 text-primary" />
            System Administration
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Manage user accounts, RBAC policy assignments, and system-wide security controls.
          </p>
          <div className="pt-2">
            {isAdmin ? (
              <Link
                to="/admin/users"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "w-full justify-start text-xs"
                )}
              >
                Open Admin Console
              </Link>
            ) : (
              <Button size="sm" variant="ghost" disabled className="w-full justify-start text-xs text-muted-foreground/60">
                <Lock className="size-3.5 mr-1" />
                Admin Restricted
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Role & Permissions Inspector (Adjustment 5: Displaying authority) */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound className="size-4 text-primary" />
            Security Authority Matrix
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {user.permissions.length} active permission grants
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          Permissions are dynamically resolved and verified on each request by backend authorization middleware.
        </p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {user.permissions.map((perm) => (
            <span
              key={perm}
              className="inline-flex rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-mono text-muted-foreground border border-border/50"
            >
              {perm}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
