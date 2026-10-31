import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { IncidentListPage } from "@/pages/incidents/IncidentListPage";
import { ReportIncidentPage } from "@/pages/incidents/ReportIncidentPage";
import { IncidentDetailPage } from "@/pages/incidents/IncidentDetailPage";
import { ProtectedRoute } from "./ProtectedRoute";
import { RoleGuard } from "./RoleGuard";

export const router = createBrowserRouter([
  // Public auth routes
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/register",
    element: <RegisterPage />,
  },

  // Protected application routes
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: "/",
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: "/dashboard",
            element: <DashboardPage />,
          },
          {
            path: "/incidents",
            element: <IncidentListPage />,
          },
          {
            path: "/incidents/report",
            element: <ReportIncidentPage />,
          },
          {
            path: "/incidents/:id",
            element: <IncidentDetailPage />,
          },
          // Role-protected routes: Admin Console
          {
            element: <RoleGuard allowedRoles={["ADMIN"]} />,
            children: [
              {
                path: "/admin/users",
                element: <AdminUsersPage />,
              },
            ],
          },
        ],
      },
    ],
  },

  // Fallback
  {
    path: "*",
    element: <Navigate to="/dashboard" replace />,
  },
]);
