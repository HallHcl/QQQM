import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EnvironmentFormDialog from "./EnvironmentFormDialog";

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      POST: (...args: unknown[]) => postMock(...args),
      PATCH: (...args: unknown[]) => patchMock(...args),
    },
  };
});

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

// The VPN resource picker (edit-only) reads Resources through apiClient
// (useResources/useResource, migrated in Part 24a) alongside /api/projects
// and /api/environments/{id} — all routed through the same getMock.
// Default: empty resource list, 404 on single-resource lookup (nothing
// linked).
function defaultResourcePaths(path: string): Promise<unknown> | undefined {
  if (path === "/api/resources") {
    return Promise.resolve(
      ok({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
    );
  }
  if (path === "/api/resources/{id}") {
    return Promise.resolve(apiError(404, "NOT_FOUND", "Resource not found"));
  }
  return undefined;
}

const SAMPLE_PROJECT = {
  id: "p1",
  client_id: "c1",
  name: "Migration",
  description: null,
  owner_status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

const SAMPLE_ENVIRONMENT = {
  id: "e1",
  project_id: "p1",
  name: "Production",
  description: "Primary environment",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
  vpn_resource_id: null as string | null,
};

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function created<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 201 }) };
}

function apiError(status: number, code: string, message: string, details?: unknown) {
  return {
    data: undefined,
    error: { error: { code, message, details } },
    response: new Response(null, { status }),
  };
}

function renderDialog(environment?: typeof SAMPLE_ENVIRONMENT) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <EnvironmentFormDialog open onOpenChange={onOpenChange} environment={environment} />
    </QueryClientProvider>
  );
  return { onOpenChange, invalidateSpy };
}

describe("EnvironmentFormDialog — create", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
    // The project picker (`useProjects()`) hits GET /api/projects.
    getMock.mockResolvedValue(
      ok({ data: [SAMPLE_PROJECT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
    );
  });

  it("blocks submit with client-side errors when name and project are empty", async () => {
    const { onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("Project is required.")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("submits the mutation with the entered values (including project_id) and invalidates the environments query, with no vpn_resource_id in the payload", async () => {
    postMock.mockResolvedValue(created(SAMPLE_ENVIRONMENT));
    const { onOpenChange, invalidateSpy } = renderDialog();

    await screen.findByLabelText("Name");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Environment" } });

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Migration" }));

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/environments");
    expect(options.body).toEqual({ name: "New Environment", project_id: "p1", description: undefined });
    expect(options.body.vpn_resource_id).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["environments"] });
    expect(toastMock).toHaveBeenCalledWith({ title: "Environment created" });
  });

  it("surfaces a server-side validation error against the relevant field", async () => {
    postMock.mockResolvedValue(
      apiError(400, "VALIDATION_ERROR", "Validation failed", {
        formErrors: [],
        fieldErrors: { name: ["String must contain at least 1 character(s)"] },
      })
    );
    renderDialog();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x" } });

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Migration" }));

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(
      await screen.findByText("String must contain at least 1 character(s)")
    ).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({
      title: "Couldn't create environment",
      description: "Check the highlighted fields below.",
      variant: "destructive",
    });
  });
});

describe("EnvironmentFormDialog — edit", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
    getMock.mockImplementation((path: string) => {
      if (path === "/api/projects") {
        return Promise.resolve(
          ok({ data: [SAMPLE_PROJECT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
        );
      }
      if (path === "/api/environments/{id}") {
        return Promise.resolve(ok(SAMPLE_ENVIRONMENT));
      }
      const resourceResponse = defaultResourcePaths(path);
      if (resourceResponse) return resourceResponse;
      throw new Error(`Unexpected path: ${path}`);
    });
  });

  it("pre-fills the form from the loaded record, with the project locked (no ProjectPicker rendered) and the VPN resource picker present", async () => {
    renderDialog(SAMPLE_ENVIRONMENT);
    expect(screen.getByLabelText("Name")).toHaveValue("Production");
    expect(
      await screen.findByText("An environment's project can't be changed after creation.")
    ).toBeInTheDocument();
    // The create-only ProjectPicker combobox must not be rendered on edit.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue("Migration")).toBeDisabled();
    // The VPN resource picker IS shown on edit, pre-filled from vpn_resource_id (null here).
    expect(await screen.findByText("No VPN resource linked")).toBeInTheDocument();
  });

  it("does not render the VPN resource picker in create mode", async () => {
    getMock.mockResolvedValue(
      ok({ data: [SAMPLE_PROJECT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
    );
    renderDialog(undefined);
    await screen.findByLabelText("Name");
    expect(screen.queryByText(/vpn resource/i)).not.toBeInTheDocument();
  });

  it("selecting a VPN resource sends its id in the PATCH body", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/api/projects") {
        return Promise.resolve(
          ok({ data: [SAMPLE_PROJECT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
        );
      }
      if (path === "/api/environments/{id}") {
        return Promise.resolve(ok(SAMPLE_ENVIRONMENT));
      }
      if (path === "/api/resources") {
        return Promise.resolve(
          ok({
            data: [{ id: "r1", type: "link", title: "Corporate VPN" }],
            pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
          })
        );
      }
      const resourceResponse = defaultResourcePaths(path);
      if (resourceResponse) return resourceResponse;
      throw new Error(`Unexpected path: ${path}`);
    });
    patchMock.mockResolvedValue(ok({ ...SAMPLE_ENVIRONMENT, vpn_resource_id: "r1" }));
    const { onOpenChange } = renderDialog(SAMPLE_ENVIRONMENT);

    fireEvent.click(await screen.findByRole("button", { name: /no vpn resource linked/i }));
    fireEvent.click(await screen.findByText("Corporate VPN"));

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(patchMock.mock.calls[0][1].body).toMatchObject({ vpn_resource_id: "r1" });
  });

  it("shows an orphan warning instead of a normal reference when vpn_resource_id points at a deleted resource", async () => {
    // beforeEach's getMock implementation already 404s /api/resources/{id}
    // by default (nothing linked) — that's exactly the soft-deleted case.
    renderDialog({ ...SAMPLE_ENVIRONMENT, vpn_resource_id: "r-deleted" });

    expect(await screen.findByText("Linked VPN resource has been deleted")).toBeInTheDocument();
  });

  it("sends updated_at and the unchanged vpn_resource_id from the loaded record in the PATCH body, without project_id", async () => {
    patchMock.mockResolvedValue(ok({ ...SAMPLE_ENVIRONMENT, name: "Production v2" }));
    const { onOpenChange } = renderDialog(SAMPLE_ENVIRONMENT);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Production v2" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const [path, options] = patchMock.mock.calls[0];
    expect(path).toBe("/api/environments/{id}");
    expect(options.params).toEqual({ path: { id: "e1" } });
    expect(options.body).toMatchObject({
      name: "Production v2",
      updated_at: SAMPLE_ENVIRONMENT.updated_at,
      // SAMPLE_ENVIRONMENT.vpn_resource_id is null and untouched by this test.
      vpn_resource_id: null,
    });
    expect(options.body.project_id).toBeUndefined();
  });

  it("shows the conflict UI (not a generic error) on a stale-write 409, and does not lose the user's edit", async () => {
    patchMock.mockResolvedValueOnce(
      apiError(409, "CONFLICT", "Environment was modified by someone else; refresh and try again")
    );
    renderDialog(SAMPLE_ENVIRONMENT);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My In-Progress Edit" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("This record changed")).toBeInTheDocument();
    expect(
      screen.getByText("Environment was modified by someone else; refresh and try again")
    ).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();

    const freshRecord = { ...SAMPLE_ENVIRONMENT, updated_at: "2026-01-03T00:00:00.000Z" };
    getMock.mockImplementation((path: string) => {
      if (path === "/api/environments/{id}") return Promise.resolve(ok(freshRecord));
      return Promise.resolve(
        ok({ data: [SAMPLE_PROJECT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
      );
    });
    patchMock.mockResolvedValueOnce(ok({ ...freshRecord, name: "My In-Progress Edit" }));

    fireEvent.click(screen.getByRole("button", { name: /keep my changes/i }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(2));
    const [, retryOptions] = patchMock.mock.calls[1];
    expect(retryOptions.body).toMatchObject({
      name: "My In-Progress Edit",
      updated_at: freshRecord.updated_at,
    });
  });

  it("routes a duplicate-name 409 to the Name field instead of the conflict UI", async () => {
    patchMock.mockResolvedValueOnce(
      apiError(409, "CONFLICT", "An environment with this name already exists for this project")
    );
    renderDialog(SAMPLE_ENVIRONMENT);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Duplicate Name" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(
      await screen.findByText("An environment with this name already exists for this project")
    ).toBeInTheDocument();
    expect(screen.queryByText("This record changed")).not.toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({
      title: "Couldn't update environment",
      description: "An environment with this name already exists for this project",
      variant: "destructive",
    });
  });

  it("shows an error toast for an unexpected (non-field, non-conflict) failure", async () => {
    patchMock.mockResolvedValue(apiError(500, "INTERNAL", "boom"));
    renderDialog(SAMPLE_ENVIRONMENT);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Production v2" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Couldn't update environment",
        description: "boom",
        variant: "destructive",
      });
    });
  });
});
