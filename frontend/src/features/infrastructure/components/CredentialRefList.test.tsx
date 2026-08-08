import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CredentialRefList from "./CredentialRefList";

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      POST: (...args: unknown[]) => postMock(...args),
      PATCH: (...args: unknown[]) => patchMock(...args),
      DELETE: (...args: unknown[]) => deleteMock(...args),
    },
  };
});

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

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

const SAMPLE_REFERENCE = {
  id: "c1",
  server_id: "s1",
  label: "Vault path",
  reference_location: "secret/servers/web-01",
  notes: "Rotate quarterly",
  created_at: "2026-01-01T00:00:00.000Z",
  applies_to_access_method: "ssh" as const,
};

function renderList(manageable: boolean, initial: unknown[] = [SAMPLE_REFERENCE]) {
  getMock.mockResolvedValue(ok(initial));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <CredentialRefList serverId="s1" manageable={manageable} />
    </QueryClientProvider>
  );
  return { invalidateSpy };
}

describe("CredentialRefList — read-only mode (default; used by ServerCard on InfrastructurePage/EnvironmentDetailPage)", () => {
  beforeEach(() => {
    getMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
  });

  it("renders label/reference_location/applies_to_access_method/notes but no management affordances", async () => {
    renderList(false);

    expect(await screen.findByText("Vault path")).toBeInTheDocument();
    expect(screen.getByText("secret/servers/web-01")).toBeInTheDocument();
    expect(screen.getByText(/Applies to: SSH/)).toBeInTheDocument();
    expect(screen.getByText("Rotate quarterly")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add credential/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no references", async () => {
    renderList(false, []);
    expect(await screen.findByText("No credential references.")).toBeInTheDocument();
  });
});

describe("CredentialRefList — manageable mode (ServerDetailPage)", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    useAuthMock.mockReset();
  });

  describe("RBAC: create/update = admin+member, delete = admin-only (a stricter, distinct gate — verified against credentialReferences.routes.ts)", () => {
    it("shows Add and Edit but not Delete to a member", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderList(true);

      await screen.findByText("Vault path");

      expect(screen.getByRole("button", { name: /add credential reference/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    });

    it("shows Add, Edit, and Delete to an admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      renderList(true);

      await screen.findByText("Vault path");

      expect(screen.getByRole("button", { name: /add credential reference/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
    });
  });

  describe("create", () => {
    beforeEach(() => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
    });

    it("blocks submit when label/reference_location are empty", async () => {
      renderList(true, []);
      await screen.findByText("No credential references.");

      fireEvent.click(screen.getByRole("button", { name: /add credential reference/i }));
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(await screen.findByText("Label is required.")).toBeInTheDocument();
      expect(screen.getByText("Reference location is required.")).toBeInTheDocument();
      expect(postMock).not.toHaveBeenCalled();
    });

    it("submits label/reference_location/applies_to_access_method/notes with no updated_at, nested under the server, and invalidates the query", async () => {
      postMock.mockResolvedValue(created(SAMPLE_REFERENCE));
      const { invalidateSpy } = renderList(true, []);
      await screen.findByText("No credential references.");

      fireEvent.click(screen.getByRole("button", { name: /add credential reference/i }));

      fireEvent.change(await screen.findByLabelText("Label"), { target: { value: "Vault path" } });
      fireEvent.change(screen.getByLabelText("Reference location"), {
        target: { value: "secret/servers/web-01" },
      });
      fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Rotate quarterly" } });

      fireEvent.click(screen.getByRole("combobox"));
      fireEvent.click(await screen.findByRole("option", { name: "SSH" }));

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      const [path, options] = postMock.mock.calls[0];
      expect(path).toBe("/api/servers/{serverId}/credential-references");
      expect(options.params).toEqual({ path: { serverId: "s1" } });
      expect(options.body).toEqual({
        label: "Vault path",
        reference_location: "secret/servers/web-01",
        applies_to_access_method: "ssh",
        notes: "Rotate quarterly",
      });
      expect(options.body.updated_at).toBeUndefined();
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["credentialReferences"] })
      );
    });

    it("allows leaving applies_to_access_method unset", async () => {
      postMock.mockResolvedValue(created(SAMPLE_REFERENCE));
      renderList(true, []);
      await screen.findByText("No credential references.");

      fireEvent.click(screen.getByRole("button", { name: /add credential reference/i }));
      fireEvent.change(await screen.findByLabelText("Label"), { target: { value: "Vault path" } });
      fireEvent.change(screen.getByLabelText("Reference location"), {
        target: { value: "secret/servers/web-01" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      expect(postMock.mock.calls[0][1].body.applies_to_access_method).toBeUndefined();
    });

    it("surfaces a server-side validation error against the relevant field", async () => {
      postMock.mockResolvedValue(
        apiError(400, "VALIDATION_ERROR", "Validation failed", {
          formErrors: [],
          fieldErrors: { label: ["String must contain at least 1 character(s)"] },
        })
      );
      renderList(true, []);
      await screen.findByText("No credential references.");

      fireEvent.click(screen.getByRole("button", { name: /add credential reference/i }));
      fireEvent.change(await screen.findByLabelText("Label"), { target: { value: "x" } });
      fireEvent.change(screen.getByLabelText("Reference location"), { target: { value: "loc" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(
        await screen.findByText("String must contain at least 1 character(s)")
      ).toBeInTheDocument();
    });
  });

  describe("edit", () => {
    beforeEach(() => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
    });

    it("pre-fills the form from the selected reference", async () => {
      renderList(true);
      await screen.findByText("Vault path");

      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

      expect(await screen.findByLabelText("Label")).toHaveValue("Vault path");
      expect(screen.getByLabelText("Reference location")).toHaveValue("secret/servers/web-01");
      expect(screen.getByLabelText("Notes")).toHaveValue("Rotate quarterly");
    });

    it("PATCHes the top-level (non-nested) endpoint with no updated_at field at all in the payload", async () => {
      patchMock.mockResolvedValue(ok({ ...SAMPLE_REFERENCE, label: "Vault path (renamed)" }));
      renderList(true);
      await screen.findByText("Vault path");

      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      fireEvent.change(await screen.findByLabelText("Label"), {
        target: { value: "Vault path (renamed)" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      const [path, options] = patchMock.mock.calls[0];
      expect(path).toBe("/api/credential-references/{id}");
      expect(options.params).toEqual({ path: { id: "c1" } });
      expect(options.body).toEqual({
        label: "Vault path (renamed)",
        reference_location: "secret/servers/web-01",
        applies_to_access_method: "ssh",
        notes: "Rotate quarterly",
      });
      expect("updated_at" in options.body).toBe(false);
    });
  });

  describe("delete", () => {
    it("shows Delete only to an admin, not a member", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderList(true);
      await screen.findByText("Vault path");
      expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    });

    it("requires confirmation with copy stating the deletion is permanent and non-recoverable — not soft-delete language", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      renderList(true);
      await screen.findByText("Vault path");

      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

      expect(screen.getByText("Delete this credential reference?")).toBeInTheDocument();
      const description = screen.getByText(/permanently deleted immediately/i);
      expect(description).toBeInTheDocument();
      expect(description.textContent).toMatch(/not a soft delete/i);
      expect(description.textContent).toMatch(/no restore/i);
      // Must not imply recoverability the way every other module's delete
      // confirmation does (those describe soft-delete + optional restore).
      expect(description.textContent).not.toMatch(/restore.*at any time|can restore/i);
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it("calls the delete mutation and invalidates the query only on confirm", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      deleteMock.mockResolvedValue(ok(SAMPLE_REFERENCE));
      const { invalidateSpy } = renderList(true);
      await screen.findByText("Vault path");

      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
      expect(deleteMock).toHaveBeenCalledWith("/api/credential-references/{id}", {
        params: { path: { id: "c1" } },
      });
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["credentialReferences"] })
      );
    });

    it("does not call the delete mutation when the confirmation is cancelled", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      renderList(true);
      await screen.findByText("Vault path");

      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(deleteMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Delete this credential reference?")).not.toBeInTheDocument();
    });
  });

  describe("applies_to_access_method select", () => {
    it("offers the verified enum values plus a Not set option", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      renderList(true, []);
      await screen.findByText("No credential references.");

      fireEvent.click(screen.getByRole("button", { name: /add credential reference/i }));
      fireEvent.click(await screen.findByRole("combobox"));

      expect(await screen.findByRole("option", { name: "Not set" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "SSH" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "RDP" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Telnet" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Web" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Other" })).toBeInTheDocument();
    });
  });
});
