import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/auth/RequireAuth";
import LoginPage from "@/features/auth/LoginPage";
import ClientsPage from "@/features/clients/ClientsPage";
import ProjectsPage from "@/features/projects/ProjectsPage";
import ProjectDetailPage from "@/features/projects/ProjectDetailPage";
import EnvironmentsPage from "@/features/environments/EnvironmentsPage";
import EnvironmentDetailPage from "@/features/environments/EnvironmentDetailPage";
import ServersPage from "@/features/servers/ServersPage";
import ServerDetailPage from "@/features/servers/ServerDetailPage";
import OverviewPage from "@/features/overview/OverviewPage";
import InfrastructurePage from "@/features/infrastructure/InfrastructurePage";
import ResourcesPage from "@/features/resources/ResourcesPage";
import PeoplePage from "@/features/people/PeoplePage";
import SchedulePage from "@/features/schedule/SchedulePage";
import ActivityPage from "@/features/activity/ActivityPage";
import ManageUsersPage from "@/features/settings/ManageUsersPage";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/" element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="environments" element={<EnvironmentsPage />} />
          <Route path="environments/:id" element={<EnvironmentDetailPage />} />
          <Route path="servers" element={<ServersPage />} />
          <Route path="servers/:id" element={<ServerDetailPage />} />
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
