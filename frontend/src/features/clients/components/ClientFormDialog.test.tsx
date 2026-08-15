import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClientFormDialog from "./ClientFormDialog";
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
  id: "1",
  name: "Acme Corp",
  status: "active",
  description: "A widget maker",
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

function renderDialog(client?: Client) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ClientFormDialog open onOpenChange={onOpenChange} client={client} />
    </QueryClientProvider>
  );
  return { onOpenChange, invalidateSpy };
}

describe("ClientFormDialog — create", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
  });

  it("blocks submit with a client-side error when name is empty", async () => {
    const { onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("associates the Status label with its select trigger for screen readers", () => {
    renderDialog();
    expect(screen.getByLabelText(/Status/i)).toHaveAttribute("role", "combobox");
  });

  it("submits the mutation with the entered values and invalidates the clients query on success", async () => {
    postMock.mockResolvedValue(created(SAMPLE_CLIENT));
    const { onOpenChange, invalidateSpy } = renderDialog();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Co" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/clients");
    expect(options.body).toMatchObject({ name: "New Co", status: "active" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clients"] });
    expect(toastMock).toHaveBeenCalledWith({ title: "Client created" });
  });

  it("surfaces a server-side validation error against the relevant field", async () => {
    postMock.mockResolvedValue(
      apiError(400, "VALIDATION_ERROR", "Validation failed", {
        formErrors: [],
        fieldErrors: { name: ["Name already in use"] },
      })
    );
    renderDialog();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dup Co" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Name already in use")).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({
      title: "Couldn't create client",
      description: "Check the highlighted fields below.",
      variant: "destructive",
    });
  });

  it("shows an error toast for an unexpected (non-field) failure", async () => {
    postMock.mockResolvedValue(apiError(500, "INTERNAL", "boom"));
    renderDialog();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Co" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Couldn't create client",
        description: "boom",
        variant: "destructive",
      });
    });
  });
});

describe("ClientFormDialog — edit", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
    getMock.mockResolvedValue(ok(SAMPLE_CLIENT));
  });

  it("pre-fills the form from the loaded record", () => {
    renderDialog(SAMPLE_CLIENT);
    expect(screen.getByLabelText("Name")).toHaveValue("Acme Corp");
  });

  it("sends updated_at from the loaded record in the PATCH body on submit", async () => {
    patchMock.mockResolvedValue(ok({ ...SAMPLE_CLIENT, name: "Acme Corp Renamed" }));
    const { onOpenChange } = renderDialog(SAMPLE_CLIENT);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme Corp Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const [path, options] = patchMock.mock.calls[0];
    expect(path).toBe("/api/clients/{id}");
    expect(options.params).toEqual({ path: { id: "1" } });
    expect(options.body).toMatchObject({
      name: "Acme Corp Renamed",
      updated_at: SAMPLE_CLIENT.updated_at,
    });
  });

  it("shows the conflict UI instead of a generic error on a 409, and does not lose the user's edit", async () => {
    patchMock.mockResolvedValueOnce(
      apiError(409, "CONFLICT", "Client was modified by someone else; refresh and try again")
    );
    renderDialog(SAMPLE_CLIENT);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My In-Progress Edit" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("This record changed")).toBeInTheDocument();
    expect(
      screen.getByText("Client was modified by someone else; refresh and try again")
    ).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    // A stale-write conflict routes to the dedicated ConflictState UI instead
    // of a toast — matches the Schedule reference pattern's own carve-out.
    expect(toastMock).not.toHaveBeenCalled();

    // "Keep my changes & retry" resubmits with the SAME name the user typed —
    // proving the in-progress edit survived the conflict rather than being
    // silently discarded.
    const freshRecord = { ...SAMPLE_CLIENT, updated_at: "2026-01-03T00:00:00.000Z" };
    getMock.mockResolvedValueOnce(ok(freshRecord));
    patchMock.mockResolvedValueOnce(ok({ ...freshRecord, name: "My In-Progress Edit" }));

    fireEvent.click(screen.getByRole("button", { name: /keep my changes/i }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(2));
    const [, retryOptions] = patchMock.mock.calls[1];
    expect(retryOptions.body).toMatchObject({
      name: "My In-Progress Edit",
      updated_at: freshRecord.updated_at,
    });
  });

  it("reload latest replaces the form with the server's current values and clears the conflict", async () => {
    patchMock.mockResolvedValueOnce(
      apiError(409, "CONFLICT", "Client was modified by someone else; refresh and try again")
    );
    renderDialog(SAMPLE_CLIENT);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My In-Progress Edit" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("This record changed")).toBeInTheDocument();

    const freshRecord = {
      ...SAMPLE_CLIENT,
      name: "Acme Corp (renamed by someone else)",
      updated_at: "2026-01-03T00:00:00.000Z",
    };
    getMock.mockResolvedValueOnce(ok(freshRecord));

    fireEvent.click(screen.getByRole("button", { name: /reload latest version/i }));

    await waitFor(() => expect(screen.queryByText("This record changed")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Name")).toHaveValue("Acme Corp (renamed by someone else)");
  });
});
