export type RoleCode =
  | "ADMIN"
  | "EMPLOYEE"
  | "INVESTIGATOR"
  | "SECURITY_ENGINEER"
  | "SECURITY_ANALYST"
  | "INCIDENT_COMMANDER"
  | "AUDITOR";

export type UserStatus = "ACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED" | "DISABLED";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  roles: RoleCode[];
  permissions: string[];
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface AuthSuccessData {
  user: User;
  accessToken: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: AuthSuccessData;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
  };
}

export interface MeResponse {
  success: boolean;
  data: {
    user: User;
  };
}

export interface ApiErrorResponse {
  success: boolean;
  code?: string;
  message: string;
  errors?: Array<{ field: string; message: string }>;
  requiredRoles?: RoleCode[];
  requiredPermissions?: string[];
}

