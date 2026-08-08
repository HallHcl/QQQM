import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResourceMetadataDialog from "./ResourceMetadataDialog";
import type { ResourceListItem } from "@/hooks/useResources";

const getMock = vi.fn();
const patchMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      PATCH: (...args: unknown[]) => patchMock(...args),
    },
  };
});

const SAMPLE_RESOURCE: ResourceListItem = {
  id: "r1",
  project_id: null,
  type: "runbook",
  title: "Deploy guide",
  category: "ops",
  tags: ["deploy", "prod"],
  current_version_id: "v1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
  current_version: {
    id: "v1",
    version_number: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    author: { id: "p1", name: "Alex" },
  },
};

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function apiError(status: number, code: string, message: string, details?: unknown) {
  return {
    data: undefined,
    error: { error: { code, message, details } },
    response: new Response(null, { status }),
  };
}

function renderDialog(resource: ResourceListItem | undefined = SAMPLE_RESOURCE) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ResourceMetadataDialog open onOpenChange={onOpenChange} resource={resource} />
    </QueryClientProvider>
  );
  return { onOpenChange, invalidateSpy };
}

describe("ResourceMetadataDialog", () => {
  beforeEach(() => {
    getMock.mockReset();
    patchMock.mockReset();
    getMock.mockResolvedValue(ok(SAMPLE_RESOURCE));
  });

  it("pre-fills title/category/tags from the resource, with no type or content field rendered at all", () => {
    renderDialog();

    expect(screen.getByLabelText("Title")).toHaveValue("Deploy guide");
    expect(screen.getByLabelText("Category")).toHaveValue("ops");
    expect(screen.getByLabelText("Tags")).toHaveValue("deploy, prod");
    expect(screen.queryByLabelText(/type/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/content/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/external url/i)).not.toBeInTheDocument();
  });

  it("blocks submit with a client-side error when title is empty", async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("PATCHes title/category/tags with the required updated_at optimistic-lock token, and nothing else", async () => {
    patchMock.mockResolvedValue(ok({ ...SAMPLE_RESOURCE, title: "Deploy guide v2" }));
    const { onOpenChange, invalidateSpy } = renderDialog();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Deploy guide v2" } });
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "deploy, staging" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const [path, options] = patchMock.mock.calls[0];
    expect(path).toBe("/api/resources/{id}");
    expect(options.params.path).toEqual({ id: "r1" });
    expect(options.body).toEqual({
      title: "Deploy guide v2",
      category: "ops",
      tags: ["deploy", "staging"],
      updated_at: "2026-01-02T00:00:00.000Z",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["resources"] });
  });

  it("shows the conflict UI (not a generic error) on a stale-write 409, and does not lose the user's edit", async () => {
    patchMock.mockResolvedValueOnce(
      apiError(409, "CONFLICT", "Resource was modified by someone else; refresh and try again")
    );
    renderDialog();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My In-Progress Edit" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("This record changed")).toBeInTheDocument();
    expect(
      screen.getByText("Resource was modified by someone else; refresh and try again")
    ).toBeInTheDocument();

    const freshResource = { ...SAMPLE_RESOURCE, updated_at: "2026-01-03T00:00:00.000Z" };
    getMock.mockResolvedValue(ok(freshResource));
    patchMock.mockResolvedValueOnce(ok({ ...freshResource, title: "My In-Progress Edit" }));

    fireEvent.click(screen.getByRole("button", { name: /keep my changes/i }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(2));
    const [, retryOptions] = patchMock.mock.calls[1];
    expect(retryOptions.body).toMatchObject({
      title: "My In-Progress Edit",
      updated_at: freshResource.updated_at,
    });
  });

  it("has no duplicate-constraint field routing for a 409 — resources.service.ts's updateMetadata has no uniqueness check, so every 409 here is a stale-write conflict", async () => {
    // Unlike ClientFormDialog (which branches a specific duplicate-name
    // message string to a field error), there is no equivalent message to
    // branch on for resources — any 409 message routes straight to
    // ConflictState.
    patchMock.mockResolvedValueOnce(apiError(409, "CONFLICT", "Some other 409 message"));
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("This record changed")).toBeInTheDocument();
    expect(screen.getByText("Some other 409 message")).toBeInTheDocument();
  });
});
