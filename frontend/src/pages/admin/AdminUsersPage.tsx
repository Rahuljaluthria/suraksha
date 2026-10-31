import { useAppSelector } from "@/app/hooks";
import { Link } from "react-router-dom";
import { ArrowLeft, Users, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminUsersPage() {
  const { user } = useAppSelector((state) => state.auth);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/dashboard"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          )}
        >
          <ArrowLeft className="size-3.5" />
          Back to Dashboard
        </Link>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-2 text-primary font-medium text-sm">
          <ShieldCheck className="size-4" />
          Restricted Administrator Console
        </div>
        <p className="text-xs text-muted-foreground">
          This route is restricted to the <code>ADMIN</code> role. Backend authorization middleware enforces <code>requireRole('ADMIN')</code> on all management mutations.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="size-4 text-primary" />
            Security Personnel Directory
          </div>
          <span className="text-xs font-mono text-muted-foreground">System Roles: 7 active</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Authenticated as administrator: <span className="font-semibold text-foreground">{user?.email}</span>
        </p>

        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground font-mono uppercase text-[10px]">
              <tr>
                <th className="px-4 py-2.5">Role Code</th>
                <th className="px-4 py-2.5">Scope</th>
                <th className="px-4 py-2.5">Access Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-4 py-3 font-mono font-medium text-primary">ADMIN</td>
                <td className="px-4 py-3 text-muted-foreground">User & System Administration</td>
                <td className="px-4 py-3 text-muted-foreground">Global Configuration</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-medium text-foreground">INCIDENT_COMMANDER</td>
                <td className="px-4 py-3 text-muted-foreground">Incident Response & Assignment</td>
                <td className="px-4 py-3 text-muted-foreground">Universal Incident Access</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-medium text-foreground">SECURITY_ANALYST</td>
                <td className="px-4 py-3 text-muted-foreground">Monitoring & Triage</td>
                <td className="px-4 py-3 text-muted-foreground">Incident Assessment</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-medium text-foreground">SECURITY_ENGINEER</td>
                <td className="px-4 py-3 text-muted-foreground">Technical Remediation</td>
                <td className="px-4 py-3 text-muted-foreground">Assigned Incident Access</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-medium text-foreground">INVESTIGATOR</td>
                <td className="px-4 py-3 text-muted-foreground">Digital Forensics & Evidence</td>
                <td className="px-4 py-3 text-muted-foreground">Assigned Incident Access</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-medium text-foreground">AUDITOR</td>
                <td className="px-4 py-3 text-muted-foreground">Compliance & Verification</td>
                <td className="px-4 py-3 text-muted-foreground text-destructive">Strictly Read-Only</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-medium text-foreground">EMPLOYEE</td>
                <td className="px-4 py-3 text-muted-foreground">General Reporting</td>
                <td className="px-4 py-3 text-muted-foreground">Own Incidents Only</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
