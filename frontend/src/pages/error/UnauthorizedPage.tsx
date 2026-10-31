import { Link } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/app/hooks";

export function UnauthorizedPage({ requiredRoles }: { requiredRoles?: string[] }) {
  const { user } = useAppSelector((state) => state.auth);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive mb-4">
        <ShieldAlert className="size-8" />
      </div>

      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Access Restricted
      </h1>

      <p className="mt-2 text-sm text-muted-foreground max-w-md">
        You do not possess the required security privileges to access this area.
        {requiredRoles && requiredRoles.length > 0 && (
          <span className="block mt-1 font-mono text-xs text-muted-foreground/80">
            Required role(s): {requiredRoles.join(", ")}
          </span>
        )}
      </p>

      {user && (
        <div className="mt-4 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground font-mono">
          Your active roles: <span className="text-foreground">{user.roles.join(", ")}</span>
        </div>
      )}

      <div className="mt-6">
        <Link
          to="/dashboard"
          className={cn(buttonVariants({ variant: "outline" }), "gap-2 text-xs")}
        >
          <ArrowLeft className="size-4" />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
