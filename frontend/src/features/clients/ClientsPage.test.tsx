import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClientsPage from "./ClientsPage";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      POST: (...args: unknown[]) => postMock(...args),
      DELETE: (...args: unknown[]) => deleteMock(...args),
    },
  };
});

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClientsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { invalidateSpy, unmount };
}

function okResult(data: unknown[], total = data.length) {
  return {
    data: { data, pagination: { page: 1, per_page: 20, total, total_pages: 1 } },
    error: undefined,
    response: new Response(null, { status: 200 }),
  };
}

const ACTIVE_CLIENT = {
  id: "1",
  name: "Acme Corp",
  status: "active",
  description: "A widget maker",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
};

const DELETED_CLIENT = {
  id: "2",
  name: "Old Co",
  status: "inactive",
  description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: "2026-01-05T00:00:00.000Z",
};

describe("ClientsPage", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
  });

  it("shows a loading state while the fetch is in flight", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading clients/i)).toBeInTheDocument();
  });

  it("renders client rows once the fetch succeeds", async () => {
    getMock.mockResolvedValue(
      okResult([
        {
          id: "1",
          name: "Acme Corp",
          status: "active",
          description: "A widget maker",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
          deleted_at: null,
        },
      ])
    );

    renderPage();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("renders an empty state when the list is empty", async () => {
    getMock.mockResolvedValue(okResult([]));

    renderPage();

    expect(await screen.findByText(/no clients found/i)).toBeInTheDocument();
  });

  it("renders an error state when the query fails", async () => {
    getMock.mockResolvedValue({
      data: undefined,
      error: { error: { code: "INTERNAL_ERROR", message: "Something broke" } },
      response: new Response(null, { status: 500 }),
    });

    renderPage();

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
  });

  describe("RBAC-gated create", () => {
    it("shows New client to an admin but not a non-admin (create is admin-only, verified against backend/src/routes/clients.routes.ts)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));
      const { unmount } = renderPage();
      await screen.findByText("Acme Corp");
      expect(screen.getByRole("button", { name: /new client/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Acme Corp");
      expect(screen.queryByRole("button", { name: /new client/i })).not.toBeInTheDocument();
    });
  });

  describe("RBAC-gated delete/restore", () => {
    it("shows the Delete action to an admin and lets them trigger it", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));
      deleteMock.mockResolvedValue({
        data: ACTIVE_CLIENT,
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

      const { invalidateSpy } = renderPage();
      await screen.findByText("Acme Corp");

      const deleteButton = screen.getByRole("button", { name: /delete/i });
      fireEvent.click(deleteButton);

      await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
      expect(deleteMock).toHaveBeenCalledWith("/api/clients/{id}", {
        params: { path: { id: "1" } },
      });
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clients"] })
      );
    });

    it("hides the Delete action from a non-admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));

      renderPage();
      await screen.findByText("Acme Corp");

      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
      // Edit is not RBAC-gated (create/update are admin+member) and should still show.
      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    });

    it("shows the Restore action to an admin viewing a deleted client and lets them trigger it", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([DELETED_CLIENT]));
      const restoreMock = vi.fn().mockResolvedValue({
        data: { ...DELETED_CLIENT, deleted_at: null },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });
      postMock.mockImplementation(restoreMock);

      const { invalidateSpy } = renderPage();
      await screen.findByText("Old Co");

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      expect(postMock).toHaveBeenCalledWith("/api/clients/{id}/restore", {
        params: { path: { id: "2" } },
      });
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clients"] })
      );
    });

    it("hides the Restore action from a non-admin viewing a deleted client", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      getMock.mockResolvedValue(okResult([DELETED_CLIENT]));

      renderPage();
      await screen.findByText("Old Co");

      expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
      // Deleted clients show no Edit action either — only Restore is offered.
      expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    });

    it("marks a deleted client with a Deleted badge", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([DELETED_CLIENT]));

      renderPage();

      expect(await screen.findByText("Old Co")).toBeInTheDocument();
      expect(screen.getByText("Deleted")).toBeInTheDocument();
    });
  });

  describe("deleted filter", () => {
    it("sends the selected deleted filter value through to the request", async () => {
      getMock.mockResolvedValue(okResult([]));
      renderPage();

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      const [, initialOptions] = getMock.mock.calls[0];
      expect(initialOptions.params.query.deleted).toBe("false");
    });
  });
});
