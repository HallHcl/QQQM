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

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <EnvironmentFormDialog open onOpenChange={onOpenChange} />
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

// Edit-mode behavior (pre-fill, locked project field, VPN resource picker,
// PATCH payload shape, conflict/duplicate-name/error handling) moved to
// EnvironmentEditCard, now covered by EnvironmentDetailPage.test.tsx's
// "edit mode" describe block instead of here — this dialog no longer has
// an edit mode.
