import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResourcesPage from "./ResourcesPage";

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

function apiError(status: number, code: string, message: string) {
  return {
    data: undefined,
    error: { error: { code, message } },
    response: new Response(null, { status }),
  };
}

function paginated<T>(data: T[]) {
  return { data, pagination: { page: 1, per_page: 20, total: data.length, total_pages: 1 } };
}

const ACTIVE_RESOURCE = {
  id: "r1",
  project_id: null,
  type: "runbook",
  title: "Deploy guide",
  category: "ops",
  tags: ["deploy"],
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

const DELETED_RESOURCE = {
  ...ACTIVE_RESOURCE,
  id: "r2",
  title: "Old guide",
  deleted_at: "2026-01-05T00:00:00.000Z",
};

function mockGetByPath(handlers: { resources?: unknown; versions?: unknown; resourceDetail?: unknown }) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/resources") return Promise.resolve(handlers.resources ?? ok(paginated([])));
    if (path === "/api/resources/{id}/versions") return Promise.resolve(handlers.versions ?? ok(paginated([])));
    if (path === "/api/resources/{id}") {
      return Promise.resolve(
        handlers.resourceDetail ?? apiError(404, "NOT_FOUND", "Resource not found")
      );
    }
    // The (always-mounted, dialog-closed-or-not) new-version ResourceEditor
    // instance pre-fetches the current version's content as soon as a
    // resource is selected (Part 24d's pre-fill) — give it something benign
    // rather than letting it 404/error in the background during tests that
    // never open that dialog.
    if (path === "/api/resources/{id}/versions/{versionId}") {
      return Promise.resolve(
        ok({
          id: "v1",
          resource_id: "r1",
          version_number: 1,
          content: "Existing content",
          content_hash: "hash-v1",
          external_url: null,
          file_path: null,
          commit_message: "Initial version",
          author_id: "p1",
          created_at: "2026-01-01T00:00:00.000Z",
          author: { id: "p1", name: "Alex" },
        })
      );
    }
    if (path === "/api/projects") return Promise.resolve(ok(paginated([])));
    throw new Error(`Unexpected path: ${path}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <ResourcesPage />
    </QueryClientProvider>
  );
  return { invalidateSpy, unmount };
}

describe("ResourcesPage", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
  });

  it("shows a loading state while the fetch is in flight", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading resources/i)).toBeInTheDocument();
  });

  it("renders resources once loaded, including type/category", async () => {
    mockGetByPath({ resources: ok(paginated([ACTIVE_RESOURCE])) });
    renderPage();

    expect(await screen.findByText("Deploy guide")).toBeInTheDocument();
    expect(screen.getByText("runbook")).toBeInTheDocument();
    expect(screen.getByText("ops")).toBeInTheDocument();
  });

  it("renders an empty state when the list is empty", async () => {
    mockGetByPath({ resources: ok(paginated([])) });
    renderPage();

    expect(await screen.findByText(/no resources found/i)).toBeInTheDocument();
  });

  it("renders an error state when the query fails", async () => {
    getMock.mockResolvedValue(apiError(500, "INTERNAL_ERROR", "Something broke"));
    renderPage();

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
  });

  it("marks a deleted resource with a Deleted badge and dims its row", async () => {
    mockGetByPath({ resources: ok(paginated([DELETED_RESOURCE])) });
    renderPage();

    expect(await screen.findByText("Old guide")).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
  });

  describe("pagination", () => {
    it("sends page/per_page/sort/order/search/deleted/type/project_id through to the request", async () => {
      mockGetByPath({ resources: ok(paginated([])) });
      renderPage();

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      const call = getMock.mock.calls.find(([path]) => path === "/api/resources");
      expect(call).toBeDefined();
      const [, options] = call!;
      expect(options.params.query).toMatchObject({
        page: 1,
        per_page: 20,
        sort: "title",
        order: "asc",
        deleted: "false",
      });
    });

    it("advances to the next page and refetches with page=2", async () => {
      mockGetByPath({
        resources: ok({
          data: [ACTIVE_RESOURCE],
          pagination: { page: 1, per_page: 20, total: 40, total_pages: 2 },
        }),
      });
      renderPage();

      await screen.findByText("Deploy guide");
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
      getMock.mockClear();

      fireEvent.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        const call = getMock.mock.calls.find(([path]) => path === "/api/resources");
        expect(call?.[1].params.query.page).toBe(2);
      });
    });
  });

  describe("RBAC-gated create", () => {
    it("shows New resource to admin and member, not to a lower-privilege role", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ resources: ok(paginated([])) });
      const { unmount } = renderPage();
      await screen.findByText(/no resources found/i);
      expect(screen.getByRole("button", { name: /new resource/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText(/no resources found/i);
      expect(screen.getByRole("button", { name: /new resource/i })).toBeInTheDocument();
    });

    it("hides New resource from a role with neither admin nor member", async () => {
      useAuthMock.mockReturnValue({ roles: [], isLoading: false });
      mockGetByPath({ resources: ok(paginated([])) });
      renderPage();
      await screen.findByText(/no resources found/i);
      expect(screen.queryByRole("button", { name: /new resource/i })).not.toBeInTheDocument();
    });
  });

  describe("RBAC-gated detail actions", () => {
    it("shows Add version to admin and member on an active resource", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({ resources: ok(paginated([ACTIVE_RESOURCE])) });
      renderPage();

      fireEvent.click(await screen.findByText("Deploy guide"));
      expect(await screen.findByRole("button", { name: /add version/i })).toBeInTheDocument();
    });

    it("hides Add version from a non-admin/member role", async () => {
      useAuthMock.mockReturnValue({ roles: [], isLoading: false });
      mockGetByPath({ resources: ok(paginated([ACTIVE_RESOURCE])) });
      renderPage();

      fireEvent.click(await screen.findByText("Deploy guide"));
      await waitFor(() => expect(screen.getAllByText("Deploy guide").length).toBeGreaterThan(0));
      expect(screen.queryByRole("button", { name: /add version/i })).not.toBeInTheDocument();
    });

    it("shows Edit and Delete to admin, but Edit is hidden with an explanatory note for member (metadata PATCH is admin-only, unlike create/version which are admin+member)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ resources: ok(paginated([ACTIVE_RESOURCE])) });
      const { unmount } = renderPage();
      fireEvent.click(await screen.findByText("Deploy guide"));
      expect(await screen.findByRole("button", { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({ resources: ok(paginated([ACTIVE_RESOURCE])) });
      renderPage();
      fireEvent.click(await screen.findByText("Deploy guide"));
      await screen.findByRole("button", { name: /add version/i });
      expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
      // A genuinely informative note replaces the button, not just a
      // disabled button with a native tooltip.
      expect(
        screen.getByText(/editing this resource's title\/category\/tags requires admin access/i)
      ).toBeInTheDocument();
    });

    it("shows Restore to admin on a deleted resource, with an explanatory note for non-admins", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ resources: ok(paginated([DELETED_RESOURCE])) });
      const { unmount } = renderPage();
      fireEvent.click(await screen.findByText("Old guide"));
      expect(await screen.findByRole("button", { name: /restore/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({ resources: ok(paginated([DELETED_RESOURCE])) });
      renderPage();
      fireEvent.click(await screen.findByText("Old guide"));
      await waitFor(() =>
        expect(screen.getByText(/restoring a deleted resource requires admin access/i)).toBeInTheDocument()
      );
      expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
    });
  });

  describe("delete", () => {
    it("opens a confirmation with cascade-accurate copy (version history preserved) and deletes on confirm", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ resources: ok(paginated([ACTIVE_RESOURCE])) });
      deleteMock.mockResolvedValue(ok({ ...ACTIVE_RESOURCE, deleted_at: "2026-02-01T00:00:00.000Z" }));

      renderPage();
      fireEvent.click(await screen.findByText("Deploy guide"));
      fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));

      expect(await screen.findByText("Delete this resource?")).toBeInTheDocument();
      expect(screen.getByText(/its version history is not affected/i)).toBeInTheDocument();
      expect(screen.getByText(/resource_versions rows are never touched/i)).toBeInTheDocument();

      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));

      await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
      expect(deleteMock).toHaveBeenCalledWith("/api/resources/{id}", {
        params: { path: { id: "r1" } },
      });
    });
  });

  describe("restore", () => {
    it("calls the restore endpoint directly (no confirmation dialog — no data-loss risk on restore, unlike delete)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ resources: ok(paginated([DELETED_RESOURCE])) });
      postMock.mockResolvedValue(ok({ ...DELETED_RESOURCE, deleted_at: null }));

      renderPage();
      fireEvent.click(await screen.findByText("Old guide"));
      fireEvent.click(await screen.findByRole("button", { name: /restore/i }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      expect(postMock).toHaveBeenCalledWith("/api/resources/{id}/restore", {
        params: { path: { id: "r2" } },
      });
    });

    it("surfaces restore's business-rule 409 as a plain error, not ConflictState", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ resources: ok(paginated([DELETED_RESOURCE])) });
      postMock.mockResolvedValue(apiError(409, "CONFLICT", "Resource is not deleted"));

      renderPage();
      fireEvent.click(await screen.findByText("Old guide"));
      fireEvent.click(await screen.findByRole("button", { name: /restore/i }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      // No ConflictState UI ("This record changed") should ever appear for
      // this action.
      expect(screen.queryByText("This record changed")).not.toBeInTheDocument();
    });
  });

  describe("revert-to-version wiring (Part 24d)", () => {
    const HEAD_VERSION = {
      id: "v2",
      version_number: 2,
      commit_message: "Second pass",
      created_at: "2026-01-02T00:00:00.000Z",
      author: { id: "p1", name: "Alex" },
    };
    const OLD_VERSION_SUMMARY = {
      id: "v1",
      version_number: 1,
      commit_message: "Initial version",
      created_at: "2026-01-01T00:00:00.000Z",
      author: { id: "p1", name: "Alex" },
    };

    function mockRevertScenario() {
      getMock.mockImplementation(
        (path: string, options?: { params?: { path?: { id?: string; versionId?: string } } }) => {
          if (path === "/api/resources") {
            return Promise.resolve(
              ok(paginated([{ ...ACTIVE_RESOURCE, current_version_id: "v2" }]))
            );
          }
          if (path === "/api/resources/{id}/versions") {
            return Promise.resolve(ok(paginated([HEAD_VERSION, OLD_VERSION_SUMMARY])));
          }
          if (path === "/api/resources/{id}/versions/{versionId}") {
            const versionId = options?.params?.path?.versionId;
            if (versionId === "v2") {
              return Promise.resolve(
                ok({ ...HEAD_VERSION, resource_id: "r1", content: "Current content", content_hash: "h2", external_url: null, file_path: null, author_id: "p1" })
              );
            }
            return Promise.resolve(
              ok({ ...OLD_VERSION_SUMMARY, resource_id: "r1", content: "Old content", content_hash: "h1", external_url: null, file_path: null, author_id: "p1" })
            );
          }
          if (path === "/api/resources/{id}") return Promise.resolve(apiError(404, "NOT_FOUND", "n/a"));
          if (path === "/api/projects") return Promise.resolve(ok(paginated([])));
          throw new Error(`Unexpected path: ${path}`);
        }
      );
    }

    it("clicking 'Revert to this version' on a historical version opens the new-version form pre-filled with THAT version's content, not the current version's", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockRevertScenario();

      renderPage();
      fireEvent.click(await screen.findByText("Deploy guide"));

      await screen.findByText("Second pass");
      fireEvent.click(screen.getByRole("button", { name: /revert to this version/i }));

      expect(
        await screen.findByText(/pre-filled from an older version/i)
      ).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Old content"));
    });

    it("the plain 'Add version' button still pre-fills from the CURRENT version (unaffected by revert wiring)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockRevertScenario();

      renderPage();
      fireEvent.click(await screen.findByText("Deploy guide"));
      fireEvent.click(await screen.findByRole("button", { name: /^add version$/i }));

      await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));
    });
  });
});
