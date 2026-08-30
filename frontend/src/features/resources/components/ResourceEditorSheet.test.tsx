import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResourceEditorSheet from "./ResourceEditorSheet";
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
      <ResourceEditorSheet open onOpenChange={onOpenChange} mode="create" />
    </QueryClientProvider>
  );
  return { onOpenChange };
}

/**
 * Same as renderEditor, but the caller drives `open` — needed to prove the
 * reset-on-dismiss behaviour, which is only observable by closing and
 * re-opening the SAME component instance (a fresh mount would look reset
 * whether or not the component actually resets anything).
 */
function renderEditorControlled() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const ui = (open: boolean) => (
    <QueryClientProvider client={queryClient}>
      <ResourceEditorSheet open={open} onOpenChange={onOpenChange} mode="create" />
    </QueryClientProvider>
  );
  const { rerender } = render(ui(true));
  return { onOpenChange, rerender: (open: boolean) => rerender(ui(open)) };
}

describe("ResourceEditorSheet — create mode", () => {
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

    fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
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

    fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
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
      <ResourceEditorSheet
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

describe("ResourceEditorSheet — new-version mode", () => {
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

describe("ResourceEditorSheet — validation a11y", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    toastMock.mockClear();
    getMock.mockResolvedValue(
      ok({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
    );
  });

  it("shows a styled title error rather than relying on the native required bubble", async () => {
    renderEditor();

    // The form is noValidate, so nothing stops this submit at the browser
    // level — the message has to come from handleSubmit.
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("marks each invalid field with aria-invalid and leaves valid ones alone", async () => {
    renderEditor();

    // Empty title AND (type runbook) empty content.
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await screen.findByText("Title is required.");

    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Content")).toHaveAttribute("aria-invalid", "true");
    // runbook has no external_url rule, so this one stays valid.
    expect(screen.getByLabelText("External URL")).toHaveAttribute("aria-invalid", "false");
  });

  it("associates each invalid field with its own error text via aria-describedby", async () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await screen.findByText("Title is required.");

    const cases: Array<[HTMLElement, string]> = [
      [screen.getByLabelText("Title"), "Title is required."],
      [screen.getByLabelText("Content"), 'Content is required for type "Runbook".'],
    ];
    for (const [control, message] of cases) {
      const describedBy = control.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)).toHaveTextContent(message);
    }
    expect(screen.getByLabelText("External URL")).not.toHaveAttribute("aria-describedby");
  });

  it("wires aria-invalid and describedby on external_url for type link", async () => {
    renderEditor();

    fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Docs" } });
    fireEvent.change(screen.getByLabelText("External URL"), { target: { value: "http://x.com" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await screen.findByText("External URL must be a valid https:// URL.");
    const url = screen.getByLabelText("External URL");
    expect(url).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(url.getAttribute("aria-describedby") as string)).toHaveTextContent(
      "External URL must be a valid https:// URL."
    );
  });

  it("focuses the first invalid field in render order (title before content)", async () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await screen.findByText("Title is required.");

    expect(screen.getByLabelText("Title")).toHaveFocus();
  });

  it("focuses content when the title is filled but content is not", async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Deploy guide" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await screen.findByText('Content is required for type "Runbook".');
    expect(screen.getByLabelText("Content")).toHaveFocus();
  });

  it("carries no aria-invalid=true or describedby before a failed submit", async () => {
    renderEditor();
    await screen.findByLabelText("Title");

    for (const label of ["Title", "Content", "External URL"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "false");
      expect(screen.getByLabelText(label)).not.toHaveAttribute("aria-describedby");
    }
  });
});

describe("ResourceEditorSheet — create-mode dismissal and reset", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    toastMock.mockClear();
    getMock.mockResolvedValue(
      ok({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
    );
  });

  it("offers a Cancel button in create mode, which closes without submitting", async () => {
    const { onOpenChange } = renderEditor();
    await screen.findByLabelText("Title");

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(postMock).not.toHaveBeenCalled();
  });

  // Previously only new-version mode's Cancel reset anything, so create mode
  // kept a half-filled form across close/reopen. All four dismissal paths
  // now route through handleOpenChange — asserted here by re-mounting with
  // the same state-owning component after each one.
  it.each([
    ["the Cancel button", () => fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }))],
    ["the close (X) control", () => fireEvent.click(screen.getByRole("button", { name: "Close" }))],
    ["Escape", () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })],
  ])("resets create-mode state when dismissed via %s", async (_label, dismiss) => {
    const { onOpenChange, rerender } = renderEditorControlled();
    await screen.findByLabelText("Title");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Half-typed" } });
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "Half-typed body" } });

    dismiss();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    // Re-open the same instance: state must be blank again.
    rerender(true);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(""));
    expect(screen.getByLabelText("Content")).toHaveValue("");
  });

  it("resets create-mode state when dismissed by clicking the overlay", async () => {
    const { onOpenChange, rerender } = renderEditorControlled();
    await screen.findByLabelText("Title");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Half-typed" } });

    // Radix dismisses on pointerdown+up outside the content; the overlay is
    // the sibling of [role=dialog] inside the portal.
    const overlay = document.querySelector("[data-radix-popper-content-wrapper], .fixed.inset-0");
    fireEvent.pointerDown(overlay as Element, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(overlay as Element, { button: 0 });
    fireEvent.click(overlay as Element);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    rerender(true);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(""));
  });
});

describe("ResourceEditorSheet — new-version chrome", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    toastMock.mockClear();
    mockVersionGet();
  });

  it("disables Save while the prefill version is still loading", async () => {
    let resolvePrefill: (v: unknown) => void = () => {};
    getMock.mockImplementation(
      () => new Promise((resolve) => { resolvePrefill = resolve; })
    );
    renderNewVersion();

    // Prefill in flight: submitting now would post the empty initial content.
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();

    resolvePrefill(ok(CURRENT_VERSION));
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("gives the duplicate-content confirmation an alert role, and swaps out the form", async () => {
    renderNewVersion();
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This content is identical to the current version.");
    // Body and footer are both gone; the header survives.
    expect(screen.queryByLabelText("Content")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.getByText("Add new version")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create anyway" })).toBeInTheDocument();
  });
});

describe("ResourceEditorSheet — two simultaneous mounts", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    toastMock.mockClear();
    mockVersionGet();
  });

  // ResourcesPage mounts a create instance and a new-version instance at the
  // same time, each with its own `open` flag. Nothing in this component is
  // module-level mutable state, so the two must not see each other — this
  // pins that, since a shared-state regression would be silent.
  it("keeps create and new-version instances independent", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const createOnOpenChange = vi.fn();
    const versionOnOpenChange = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <ResourceEditorSheet open={false} onOpenChange={createOnOpenChange} mode="create" />
        <ResourceEditorSheet
          mode="new-version"
          open
          onOpenChange={versionOnOpenChange}
          resourceId="r1"
          resourceType="runbook"
          currentVersionId="v2"
        />
      </QueryClientProvider>
    );

    // Only the open one renders anything.
    await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue("Current content"));
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    // Editing the open instance leaves the closed one untouched.
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "Edited" } });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(versionOnOpenChange).toHaveBeenCalledWith(false));
    expect(createOnOpenChange).not.toHaveBeenCalled();
  });
});
