import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { registerUser, clearAuthError } from "@/features/auth/authSlice";
import { registerSchema, type RegisterInput } from "@/features/auth/authValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function RegisterPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const { isAuthenticated, isSubmitting, error } = useAppSelector((state) => state.auth);

  const [formData, setFormData] = useState<RegisterInput>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

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

    const result = registerSchema.safeParse(formData);
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
    const res = await dispatch(registerUser(result.data));

    if (registerUser.fulfilled.match(res)) {
      setRegistrationSuccess(true);
      toast.success("Account created successfully. You may now sign in.");
      setTimeout(() => {
        navigate("/login");
      }, 1500);
    }
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
            Create Suraksha Account
          </h1>
          <p className="text-xs text-muted-foreground max-w-xs">
            Register for internal access. New accounts are provisioned with the standard Employee role.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {registrationSuccess ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-6 text-center">
              <CheckCircle2 className="size-10 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Registration Successful</h2>
              <p className="text-xs text-muted-foreground">
                Redirecting you to the sign in portal...
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium leading-relaxed">{error}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" required>
                      First Name
                    </Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      placeholder="Kavya"
                      value={formData.firstName}
                      onChange={handleChange}
                      disabled={isSubmitting}
                      error={Boolean(fieldErrors.firstName)}
                    />
                    {fieldErrors.firstName && (
                      <p className="text-xs text-destructive">{fieldErrors.firstName}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" required>
                      Last Name
                    </Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      placeholder="Sharma"
                      value={formData.lastName}
                      onChange={handleChange}
                      disabled={isSubmitting}
                      error={Boolean(fieldErrors.lastName)}
                    />
                    {fieldErrors.lastName && (
                      <p className="text-xs text-destructive">{fieldErrors.lastName}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" required>
                    Work Email
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
                  <Label htmlFor="password" required>
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 8 chars, 1 uppercase, 1 digit, 1 symbol"
                      autoComplete="new-password"
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

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" required>
                    Confirm Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    error={Boolean(fieldErrors.confirmPassword)}
                  />
                  {fieldErrors.confirmPassword && (
                    <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                  )}
                </div>

                <Button type="submit" disabled={isSubmitting} className="w-full mt-2">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    "Complete Registration"
                  )}
                </Button>
              </form>

              <div className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
                Already have an enterprise account?{" "}
                <Link
                  to="/login"
                  className="font-medium text-primary hover:underline transition-colors"
                >
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

