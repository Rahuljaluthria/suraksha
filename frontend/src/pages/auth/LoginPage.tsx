import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { loginUser, clearAuthError } from "@/features/auth/authSlice";
import { loginSchema, type LoginInput } from "@/features/auth/authValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, ShieldCheck, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const { isAuthenticated, isSubmitting, error, errorCode } = useAppSelector(
    (state) => state.auth
  );

  const [formData, setFormData] = useState<LoginInput>({
    email: "",
    password: "",
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/dashboard";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  // Clear previous errors on mount
  useEffect(() => {
    dispatch(clearAuthError());
  }, [dispatch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side Zod validation
    const result = loginSchema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const fieldName = issue.path[0] as string;
        if (!errors[fieldName]) {
          errors[fieldName] = issue.message;
        }
      });
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    await dispatch(loginUser(result.data));
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Branding */}
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Suraksha Security Operations
          </h1>
          <p className="text-xs text-muted-foreground max-w-xs">
            Enter your enterprise credentials to access incident response and telemetry systems.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {errorCode === "ACCOUNT_LOCKED" ? (
                <ShieldAlert className="size-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-medium leading-relaxed">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" required>
                Enterprise Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@suraksha.local"
                autoComplete="email"
                value={formData.email}
                onChange={handleChange}
                disabled={isSubmitting}
                error={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email && (
                <p className="text-xs text-destructive">{fieldErrors.email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" required>
                  Password
                </Label>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  error={Boolean(fieldErrors.password)}
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-destructive">{fieldErrors.password}</p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full mt-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
            Don't have an enterprise account?{" "}
            <Link
              to="/register"
              className="font-medium text-primary hover:underline transition-colors"
            >
              Register here
            </Link>
          </div>
        </div>

        {/* Security Notice */}
        <p className="text-center text-[11px] text-muted-foreground/70">
          Authorized personnel only. All access attempts are recorded in the immutable audit log.
        </p>
      </div>
    </div>
  );
}

