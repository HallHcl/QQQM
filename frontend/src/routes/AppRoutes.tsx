import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/features/auth/useAuth";
import LoginPage from "@/features/auth/LoginPage";
import OverviewPage from "@/features/overview/OverviewPage";
import InfrastructurePage from "@/features/infrastructure/InfrastructurePage";
import ResourcesPage from "@/features/resources/ResourcesPage";
import PeoplePage from "@/features/people/PeoplePage";
import SchedulePage from "@/features/schedule/SchedulePage";
import ActivityPage from "@/features/activity/ActivityPage";
import ManageUsersPage from "@/features/settings/ManageUsersPage";

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/" element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="infrastructure" element={<InfrastructurePage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="settings/manage-users" element={<ManageUsersPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}
