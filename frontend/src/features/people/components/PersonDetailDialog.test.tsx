import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PersonDetailDialog from "./PersonDetailDialog";
import type { Person } from "@/types";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();
const toastMock = vi.fn();

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

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function apiError(status: number, message: string) {
  return {
    data: undefined,
    error: { error: { message } },
    response: new Response(null, { status }),
  };
}

const PERSON: Person = {
  id: "person1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: null,
  type: "internal_engineer",
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

const CLIENT_1 = { id: "c1", name: "Acme Corp" };
const LINKED_CLIENT_1 = { id: "c1", name: "Acme Corp", relationship_type: null };

function mockGetByPath(handlers: { clients?: unknown; personClients?: unknown }) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/clients")
      return Promise.resolve(
        handlers.clients ?? ok({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
      );
    if (path === "/api/people/{id}/clients") return Promise.resolve(handlers.personClients ?? ok([]));
    throw new Error(`Unexpected path in test: ${path}`);
  });
}

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <PersonDetailDialog person={PERSON} open onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
  return { onOpenChange };
}

describe("PersonDetailDialog", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    toastMock.mockClear();
  });

  it("adds a client and shows a success toast", async () => {
    mockGetByPath({
      clients: ok({ data: [CLIENT_1], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } }),
      personClients: ok([]),
    });
    postMock.mockResolvedValue(ok({ message: "linked" }));

    renderDialog();
    await screen.findByText("No client associations.");

    fireEvent.click(await screen.findByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Acme Corp" }));
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock).toHaveBeenCalledWith("/api/people/{id}/clients", {
      params: { path: { id: "person1" } },
      body: { client_id: "c1", relationship_type: undefined },
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "Client added" });
  });

  it("shows an error toast when adding a client fails", async () => {
    mockGetByPath({
      clients: ok({ data: [CLIENT_1], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } }),
      personClients: ok([]),
    });
    postMock.mockResolvedValue(apiError(500, "boom"));

    renderDialog();
    await screen.findByText("No client associations.");

    fireEvent.click(await screen.findByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Acme Corp" }));
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Couldn't add client",
        description: "boom",
        variant: "destructive",
      });
    });
  });

  it("removes a client and shows a success toast", async () => {
    mockGetByPath({
      clients: ok({ data: [CLIENT_1], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } }),
      personClients: ok([LINKED_CLIENT_1]),
    });
    deleteMock.mockResolvedValue(ok({ message: "removed" }));

    renderDialog();
    await screen.findByText("Acme Corp");

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    expect(deleteMock).toHaveBeenCalledWith("/api/people/{id}/clients/{clientId}", {
      params: { path: { id: "person1", clientId: "c1" } },
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "Client removed" });
  });

  it("shows an error toast when removing a client fails", async () => {
    mockGetByPath({
      clients: ok({ data: [CLIENT_1], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } }),
      personClients: ok([LINKED_CLIENT_1]),
    });
    deleteMock.mockResolvedValue(apiError(500, "boom"));

    renderDialog();
    await screen.findByText("Acme Corp");

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Couldn't remove client",
        description: "boom",
        variant: "destructive",
      });
    });
  });
});
