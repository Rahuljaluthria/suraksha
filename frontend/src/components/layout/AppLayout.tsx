import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { logoutUser } from "@/features/auth/authSlice";
import { Toaster, toast } from "sonner";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    toast.info("Logged out successfully");
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-sidebar px-4 md:px-6">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground">Suraksha</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
              SOC v1.0
            </span>
          </Link>

          {isAuthenticated && (
            <nav className="hidden md:flex items-center gap-1 text-xs">
              <Link
                to="/dashboard"
                className={cn(
                  "px-3 py-1.5 rounded-md transition-colors",
                  location.pathname === "/dashboard"
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Dashboard
              </Link>
              <Link
                to="/incidents"
                className={cn(
                  "px-3 py-1.5 rounded-md transition-colors",
                  location.pathname.startsWith("/incidents")
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Incidents
              </Link>
              {user?.roles.includes("ADMIN") && (
                <Link
                  to="/admin/users"
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-colors",
                    location.pathname.startsWith("/admin")
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Admin
                </Link>
              )}
            </nav>
          )}
        </div>

        {isAuthenticated && user && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-medium text-foreground">
                {user.firstName} {user.lastName}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-primary font-medium">
                  {user.roles[0]}
                </span>
                {user.roles.length > 1 && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    +{user.roles.length - 1}
                  </span>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              size="xs"
              onClick={handleLogout}
              className="gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        )}
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">
        <Outlet />
      </main>

      <Toaster richColors theme="dark" position="top-right" />
    </div>
  );
}
