import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResourceEditor from "./ResourceEditor";
import type { ResourceType } from "@/types";

// The new-version mode tests each await prefill data before interacting
// (waitFor + findBy*), and both create and new-version suites use
// react-query with mocked fetches across 18 tests. Under full-suite CPU
// contention these were reported as timing out — same pattern as
// ServerFormSheet.test.tsx. Scoped override, does NOT change the global
// default.
vi.setConfig({ testTimeout: 15000 });


const getMock = vi.fn();
const postMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      POST: (...args: unknown[]) => postMock(...args),
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

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ResourceEditor open onOpenChange={onOpenChange} mode="create" />
    </QueryClientProvider>
  );
  return { onOpenChange };
}

describe("ResourceEditor — create mode", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    toastMock.mockClear();
    getMock.mockResolvedValue(
      ok({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
    );
  });

  it("renders all 7 resource types in the Type select (shared RESOURCE_TYPES constant, not a locally-duplicated list)", async () => {
    renderEditor();

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    for (const label of ["Runbook", "SOP", "Architecture", "Troubleshooting", "FAQ", "Link", "PDF"]) {
      expect(await screen.findByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  it("blocks submit and shows a field error when content is empty for a content-required type (runbook)", async () => {
    postMock.mockResolvedValue(ok({ id: "r1" }));
    renderEditor();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Deploy guide" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText('Content is required for type "Runbook".')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("blocks submit and shows a field error for a non-https external_url on type link", async () => {
    renderEditor();

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Docs" } });
    fireEvent.change(screen.getByLabelText("External URL"), {
      target: { value: "http://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("External URL must be a valid https:// URL.")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("submits when a content-required type has content, and shows a success toast", async () => {
    postMock.mockResolvedValue(ok({ id: "r1" }));
    const { onOpenChange } = renderEditor();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Deploy guide" } });
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "Step 1..." } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith({ title: "Resource created" });
  });

  it("shows an error toast and keeps the dialog open when the create mutation fails", async () => {
    postMock.mockResolvedValue(apiError(500, "boom"));
    const { onOpenChange } = renderEditor();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Deploy guide" } });
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "Step 1..." } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Couldn't create resource",
        description: "boom",
        variant: "destructive",
      });
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

const CURRENT_VERSION = {
  id: "v2",
  resource_id: "r1",
  version_number: 2,
  content: "Current content",
  content_hash: "hash-current",
  external_url: null,
  file_path: null,
  commit_message: "v2 message",
  author_id: "p1",
  created_at: "2026-01-02T00:00:00.000Z",
  author: { id: "p1", name: "Alex" },
};

const OLD_VERSION = {
  id: "v1",
  resource_id: "r1",
  version_number: 1,
  content: "Old content",
  content_hash: "hash-old",
  external_url: null,
  file_path: null,
  commit_message: "v1 message",
  author_id: "p1",
  created_at: "2026-01-01T00:00:00.000Z",
  author: { id: "p1", name: "Alex" },
};

function mockVersionGet(overrides: Record<string, unknown> = {}) {
  getMock.mockImplementation(
    (path: string, options: { params: { path: { versionId: string } } }) => {
      if (path === "/api/resources/{id}/versions/{versionId}") {
        const versionId = options.params.path.versionId;
        if (versionId in overrides) return Promise.resolve(ok(overrides[versionId]));
        if (versionId === "v2") return Promise.resolve(ok(CURRENT_VERSION));
        if (versionId === "v1") return Promise.resolve(ok(OLD_VERSION));
      }
      throw new Error(`Unexpected GET: ${path} / ${JSON.stringify(options.params)}`);
    }
  );
}

function renderNewVersion(
  props: Partial<{ prefillVersionId: string; resourceType: ResourceType }> = {}
) {
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ResourceEditor
        mode="new-version"
        open
        onOpenChange={onOpenChange}
        resourceId="r1"
        resourceType="runbook"
        currentVersionId="v2"
        {...props}
      />
    </QueryClientProvider>
  );
  return { onOpenChange };
}

describe("ResourceEditor — new-version mode", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    toastMock.mockClear();
    mockVersionGet();
  });

  it("has no Type/Title/Category fields — only content/external_url/commit_message", () => {
    renderNewVersion();
    expect(screen.queryByText("Type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("pre-fills content from the CURRENT version by default", async () => {
    renderNewVersion();
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));
  });

  it("pre-fills content from a historical version when prefillVersionId is passed (revert flow)", async () => {
    renderNewVersion({ prefillVersionId: "v1" });
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Old content"));
  });

  it("applies the same type-conditional validation as create mode (content required for runbook)", async () => {
    renderNewVersion();
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));

    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText('Content is required for type "Runbook".')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("has no content requirement for a type without one (pdf) — submits with empty content", async () => {
    postMock.mockResolvedValue(ok({ version: { id: "v3" }, warning: undefined }));
    const { onOpenChange } = renderNewVersion({ resourceType: "pdf" });
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));

    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("submits normally, with no warning, when content differs from the current version", async () => {
    postMock.mockResolvedValue(ok({ version: { id: "v3" }, warning: undefined }));
    const { onOpenChange } = renderNewVersion();
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));

    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "New content" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/identical to the current version/i)).not.toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({ title: "New version added" });
  });

  it("blocks submit with a confirmation step when content is unchanged from the current version", async () => {
    renderNewVersion();
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      await screen.findByText(
        "This content is identical to the current version. Create a new version anyway?"
      )
    ).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("proceeds with the submission when the user confirms the duplicate-content warning", async () => {
    postMock.mockResolvedValue(ok({ version: { id: "v3" }, warning: undefined }));
    const { onOpenChange } = renderNewVersion();
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /create anyway/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(postMock).toHaveBeenCalledTimes(1);
    const [, options] = postMock.mock.calls[0];
    expect(options.body.content).toBe("Current content");
  });

  it("cancelling the duplicate-content warning returns to the form without submitting", async () => {
    renderNewVersion();
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await screen.findByText(/identical to the current version/i);
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.getByLabelText("Content")).toHaveValue("Current content");
    expect(postMock).not.toHaveBeenCalled();
  });

  it("warns before submit when reverting to an old version whose content happens to match the CURRENT version (compares against current, not the revert source)", async () => {
    mockVersionGet({ v1: { ...OLD_VERSION, content: CURRENT_VERSION.content } });

    renderNewVersion({ prefillVersionId: "v1" });
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/identical to the current version/i)).toBeInTheDocument();
  });

  it("does NOT warn when reverting to an old version whose content differs from the current version", async () => {
    postMock.mockResolvedValue(ok({ version: { id: "v3" }, warning: undefined }));
    const { onOpenChange } = renderNewVersion({ prefillVersionId: "v1" });
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Old content"));

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByText(/identical to the current version/i)).not.toBeInTheDocument();
  });

  it("surfaces the backend's `warning` field as a toast fallback after a successful submit", async () => {
    postMock.mockResolvedValue(
      ok({ version: { id: "v3" }, warning: "Content identical to current version" })
    );
    const { onOpenChange } = renderNewVersion();
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));

    // Different content client-side, so the pre-submit check doesn't fire —
    // this exercises only the backend-warning fallback path.
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "Something else" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Content identical to current version" })
    );
  });

  it("Cancel closes the dialog without calling the mutation", async () => {
    const { onOpenChange } = renderNewVersion();
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(postMock).not.toHaveBeenCalled();
  });
});
