import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectFormDialog from "./ProjectFormDialog";
import type { Client } from "@/types";

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

const SAMPLE_CLIENT: Client = {
  id: "c1",
  name: "Acme Corp",
  status: "active",
  description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

const SAMPLE_PROJECT = {
  id: "p1",
  client_id: "c1",
  name: "Migration",
  description: "Legacy data migration",
  owner_status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
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

function renderDialog(project?: typeof SAMPLE_PROJECT) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ProjectFormDialog open onOpenChange={onOpenChange} project={project} />
    </QueryClientProvider>
  );
  return { onOpenChange, invalidateSpy };
}

describe("ProjectFormDialog — create", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
    // The client picker (`useClients()`) hits GET /api/clients.
    getMock.mockResolvedValue(ok({ data: [SAMPLE_CLIENT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } }));
  });

  it("associates the Client label with its select trigger for screen readers", async () => {
    renderDialog();
    expect(await screen.findByLabelText("Client")).toHaveAttribute("role", "combobox");
  });

  it("blocks submit with client-side errors when name and client are empty", async () => {
    const { onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("Client is required.")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("submits the mutation with the entered values (including client_id) and invalidates the projects query", async () => {
    postMock.mockResolvedValue(created(SAMPLE_PROJECT));
    const { onOpenChange, invalidateSpy } = renderDialog();

    await screen.findByLabelText("Name");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Project" } });

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Acme Corp" }));

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/projects");
    expect(options.body).toMatchObject({ name: "New Project", client_id: "c1" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] });
    expect(toastMock).toHaveBeenCalledWith({ title: "Project created" });
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
    fireEvent.click(await screen.findByRole("option", { name: "Acme Corp" }));

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(
      await screen.findByText("String must contain at least 1 character(s)")
    ).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({
      title: "Couldn't create project",
      description: "Check the highlighted fields below.",
      variant: "destructive",
    });
  });
});

describe("ProjectFormDialog — edit", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
    getMock.mockImplementation((path: string) => {
      if (path === "/api/clients") {
        return Promise.resolve(
          ok({ data: [SAMPLE_CLIENT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
        );
      }
      if (path === "/api/projects/{id}") {
        return Promise.resolve(ok(SAMPLE_PROJECT));
      }
      throw new Error(`Unexpected path: ${path}`);
    });
  });

  it("pre-fills the form from the loaded record, with the client locked", () => {
    renderDialog(SAMPLE_PROJECT);
    expect(screen.getByLabelText("Name")).toHaveValue("Migration");
    expect(screen.getByText("A project's client can't be changed after creation.")).toBeInTheDocument();
  });

  it("resolves the client's real name in the locked field even when that client has since been soft-deleted (projects don't cascade-hide — decisions.md #6)", async () => {
    const DELETED_CLIENT: Client = { ...SAMPLE_CLIENT, id: "c-orphan", name: "Orphan Test Client", deleted_at: "2026-01-10T00:00:00.000Z" };
    getMock.mockImplementation((path: string) => {
      if (path === "/api/clients") {
        return Promise.resolve(
          ok({ data: [DELETED_CLIENT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
        );
      }
      if (path === "/api/projects/{id}") {
        return Promise.resolve(ok({ ...SAMPLE_PROJECT, client_id: "c-orphan" }));
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    renderDialog({ ...SAMPLE_PROJECT, client_id: "c-orphan" });
    await waitFor(() => expect(screen.getByLabelText("Client")).toHaveValue("Orphan Test Client"));
  });

  it("sends updated_at from the loaded record in the PATCH body, without client_id", async () => {
    patchMock.mockResolvedValue(ok({ ...SAMPLE_PROJECT, name: "Migration v2" }));
    const { onOpenChange } = renderDialog(SAMPLE_PROJECT);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Migration v2" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const [path, options] = patchMock.mock.calls[0];
    expect(path).toBe("/api/projects/{id}");
    expect(options.params).toEqual({ path: { id: "p1" } });
    expect(options.body).toMatchObject({
      name: "Migration v2",
      updated_at: SAMPLE_PROJECT.updated_at,
    });
    expect(options.body.client_id).toBeUndefined();
  });

  it("shows the conflict UI (not a generic error) on a stale-write 409, and does not lose the user's edit", async () => {
    patchMock.mockResolvedValueOnce(
      apiError(409, "CONFLICT", "Project was modified by someone else; refresh and try again")
    );
    renderDialog(SAMPLE_PROJECT);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My In-Progress Edit" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("This record changed")).toBeInTheDocument();
    expect(
      screen.getByText("Project was modified by someone else; refresh and try again")
    ).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();

    const freshRecord = { ...SAMPLE_PROJECT, updated_at: "2026-01-03T00:00:00.000Z" };
    getMock.mockImplementation((path: string) => {
      if (path === "/api/projects/{id}") return Promise.resolve(ok(freshRecord));
      return Promise.resolve(
        ok({ data: [SAMPLE_CLIENT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
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
      apiError(409, "CONFLICT", "A project with this name already exists for this client")
    );
    renderDialog(SAMPLE_PROJECT);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Duplicate Name" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(
      await screen.findByText("A project with this name already exists for this client")
    ).toBeInTheDocument();
    expect(screen.queryByText("This record changed")).not.toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({
      title: "Couldn't update project",
      description: "A project with this name already exists for this client",
      variant: "destructive",
    });
  });

  it("shows an error toast for an unexpected (non-field, non-conflict) failure", async () => {
    patchMock.mockResolvedValue(apiError(500, "INTERNAL", "boom"));
    renderDialog(SAMPLE_PROJECT);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Migration v2" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Couldn't update project",
        description: "boom",
        variant: "destructive",
      });
    });
  });
});
