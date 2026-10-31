import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAppSelector } from "@/app/hooks";
import { ShieldCheck, Loader2 } from "lucide-react";

export function ProtectedRoute() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAppSelector((state) => state.auth);

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background text-foreground space-y-4">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary animate-pulse">
          <ShieldCheck className="size-6" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          Verifying security session...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

