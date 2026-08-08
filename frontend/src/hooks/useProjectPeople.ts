import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";

const KEY = "projects";

/**
 * Roster for a project — `GET /projects/:id/people`. Deliberately includes
 * soft-deleted people (the backend keeps them for history), so this list is
 * never filtered against the person's or the client's current state.
 */
export function useProjectPeople(projectId: string | undefined) {
  return useQuery({
    queryKey: [KEY, projectId, "people"],
    queryFn: async () => {
      const result = await apiClient.GET("/api/projects/{id}/people", {
        params: { path: { id: projectId as string } },
      });
      return unwrapApiResult(result);
    },
    enabled: Boolean(projectId),
  });
}

export function useAssignPersonToProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      peopleId,
      roleInProject,
    }: {
      projectId: string;
      peopleId: string;
      roleInProject: string;
    }) => {
      const result = await apiClient.POST("/api/projects/{id}/people", {
        params: { path: { id: projectId } },
        body: { people_id: peopleId, role_in_project: roleInProject },
      });
      return unwrapApiResult(result);
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [KEY, variables.projectId, "people"] }),
  });
}

// role_in_project has no PATCH endpoint (verified against
// frontend/src/api/generated/schema.d.ts: "/api/projects/{id}/people/{peopleId}"
// only defines `delete`, `patch` is `never`) — it's set once at assignment
// and can only be changed by removing and re-assigning with a new role.
// No useUpdateProjectPersonRole hook exists because the API doesn't support it.

export function useRemovePersonFromProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, peopleId }: { projectId: string; peopleId: string }) => {
      const result = await apiClient.DELETE("/api/projects/{id}/people/{peopleId}", {
        params: { path: { id: projectId, peopleId } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [KEY, variables.projectId, "people"] }),
  });
}
