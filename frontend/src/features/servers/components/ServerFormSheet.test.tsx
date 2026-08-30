import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServerFormSheet from "./ServerFormSheet";

// This file's tests each drive several sequential Radix `Select` interactions
// (open -> portal render/position -> option find -> click, repeated for the
// Environment/Service type/Access method pickers) on top of this component's
// hand-rolled validation (there is no react-hook-form here, despite what an
// earlier revision of this comment claimed) and React Query. That's the most
// cumulative async UI work of
// any file in the suite, and it reliably fits within Vitest's 5s default
// `testTimeout` in isolation and under normal single-suite-run load, but
// under heavy CI CPU contention (reproduced locally by running two full
// suites concurrently) the extra wall-clock time pushed exactly these tests
// over the 5s line while lighter tests elsewhere had more margin. This is a
// scoped, file-local increase (not a global timeout bump) to give this
// specific file the extra headroom the awaited work legitimately needs.
vi.setConfig({ testTimeout: 15000 });

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

const SAMPLE_ENVIRONMENT = {
  id: "e1",
  project_id: "p1",
  name: "Production",
  description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  vpn_resource_id: null,
};

const SAMPLE_SERVER = {
  id: "s1",
  environment_id: "e1",
  hostname: "web-01",
  ip_address: "10.0.0.1",
  tech_stack: ["node", "postgres"],
  monitoring_url: null,
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
  display_name: "Web 01",
  service_type: "application" as const,
  access_method: "ssh" as const,
  access_host: "web-01.internal",
  access_port: 22,
  access_path: null,
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

function renderSheet() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ServerFormSheet open onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
  return { onOpenChange, invalidateSpy };
}

describe("ServerFormSheet — create", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
    // The environment picker (`useEnvironments()`) hits GET /api/environments.
    getMock.mockResolvedValue(
      ok({ data: [SAMPLE_ENVIRONMENT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
    );
  });

  it("blocks submit with client-side errors when required fields are empty", async () => {
    const { onOpenChange } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Display name is required.")).toBeInTheDocument();
    expect(screen.getByText("Environment is required.")).toBeInTheDocument();
    expect(screen.getByText("Hostname is required.")).toBeInTheDocument();
    expect(screen.getByText("Service type is required.")).toBeInTheDocument();
    expect(screen.getByText("Access method is required.")).toBeInTheDocument();
    expect(screen.getByText("Access host is required.")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range access_port and an access_path that doesn't start with /", async () => {
    renderSheet();
    await screen.findByLabelText("Display name");

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Web 01" } });
    fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: "web-01" } });
    fireEvent.change(screen.getByLabelText("Access host"), { target: { value: "web-01.internal" } });
    fireEvent.change(screen.getByLabelText(/Port/i), { target: { value: "99999" } });
    fireEvent.change(screen.getByLabelText(/Access path/i), { target: { value: "no-leading-slash" } });

    const [environmentTrigger, serviceTypeTrigger, accessMethodTrigger] = screen.getAllByRole("combobox");
    fireEvent.click(environmentTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "Production" }));
    fireEvent.click(serviceTypeTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "Application" }));
    fireEvent.click(accessMethodTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "SSH" }));

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(
      await screen.findByText("Port must be a whole number between 1 and 65535.")
    ).toBeInTheDocument();
    expect(screen.getByText("Access path must start with /.")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("submits the full Access Documentation field set, with access_path always sent regardless of access_method", async () => {
    postMock.mockResolvedValue(created(SAMPLE_SERVER));
    const { onOpenChange, invalidateSpy } = renderSheet();

    await screen.findByLabelText("Display name");
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Web 01" } });
    fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: "web-01" } });
    fireEvent.change(screen.getByLabelText(/IP address/i), { target: { value: "10.0.0.1" } });
    fireEvent.change(screen.getByLabelText("Tech stack"), { target: { value: "node, postgres" } });
    fireEvent.change(screen.getByLabelText("Access host"), { target: { value: "web-01.internal" } });
    fireEvent.change(screen.getByLabelText(/Port/i), { target: { value: "22" } });
    // access_method will be "ssh" (not "web"), yet access_path is still sent —
    // the backend enforces no relationship between the two.
    fireEvent.change(screen.getByLabelText(/Access path/i), { target: { value: "/some/path" } });
    fireEvent.change(screen.getByLabelText(/Monitoring URL/i), {
      target: { value: "https://grafana.example.com/d/web-01" },
    });
    fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: "Primary web node" } });

    const [environmentTrigger, serviceTypeTrigger, accessMethodTrigger] = screen.getAllByRole("combobox");
    fireEvent.click(environmentTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "Production" }));
    fireEvent.click(serviceTypeTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "Application" }));
    fireEvent.click(accessMethodTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "SSH" }));

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/servers");
    expect(options.body).toEqual({
      environment_id: "e1",
      display_name: "Web 01",
      hostname: "web-01",
      ip_address: "10.0.0.1",
      tech_stack: ["node", "postgres"],
      service_type: "application",
      access_method: "ssh",
      access_host: "web-01.internal",
      access_port: 22,
      access_path: "/some/path",
      monitoring_url: "https://grafana.example.com/d/web-01",
      notes: "Primary web node",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["servers"] });
    expect(toastMock).toHaveBeenCalledWith({ title: "Server created" });
  });

  it("surfaces a server-side validation error against the relevant field", async () => {
    postMock.mockResolvedValue(
      apiError(400, "VALIDATION_ERROR", "Validation failed", {
        formErrors: [],
        fieldErrors: { hostname: ["String must contain at least 1 character(s)"] },
      })
    );
    renderSheet();

    await screen.findByLabelText("Display name");
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Web 01" } });
    fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("Access host"), { target: { value: "web-01.internal" } });

    const [environmentTrigger, serviceTypeTrigger, accessMethodTrigger] = screen.getAllByRole("combobox");
    fireEvent.click(environmentTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "Production" }));
    fireEvent.click(serviceTypeTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "Application" }));
    fireEvent.click(accessMethodTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "SSH" }));

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(
      await screen.findByText("String must contain at least 1 character(s)")
    ).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({
      title: "Couldn't create server",
      description: "Check the highlighted fields below.",
      variant: "destructive",
    });
  });
});

// Edit-mode behavior (pre-fill, locked environment field, PATCH payload
// shape, conflict/error handling) moved to ServerEditCard, now covered by
// ServerDetailPage.test.tsx's "edit mode" describe block instead of here —
// this sheet has no edit mode.

describe("ServerFormSheet — accessibility", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
    getMock.mockResolvedValue(
      ok({ data: [SAMPLE_ENVIRONMENT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
    );
  });

  it("marks invalid fields with aria-invalid and leaves valid ones alone", async () => {
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await screen.findByText("Display name is required.");

    // Required, left empty -> invalid.
    expect(screen.getByLabelText("Display name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Hostname")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Access host")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("combobox", { name: /Service type/i })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByRole("combobox", { name: /Access method/i })).toHaveAttribute(
      "aria-invalid",
      "true"
    );

    // Optional, also empty -> NOT invalid. Guards against blanket-marking.
    expect(screen.getByLabelText(/IP address/i)).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText(/Notes/i)).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText("Tech stack")).toHaveAttribute("aria-invalid", "false");
  });

  it("associates each invalid field with its own error text via aria-describedby", async () => {
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await screen.findByText("Display name is required.");

    // Each field points at an element whose text is that field's message —
    // not merely "some id exists", which would still pass if the wiring were
    // crossed between two fields.
    const cases: Array<[HTMLElement, string]> = [
      [screen.getByLabelText("Display name"), "Display name is required."],
      [screen.getByLabelText("Hostname"), "Hostname is required."],
      [screen.getByLabelText("Access host"), "Access host is required."],
      [screen.getByRole("combobox", { name: /Environment/i }), "Environment is required."],
      [screen.getByRole("combobox", { name: /Service type/i }), "Service type is required."],
      [screen.getByRole("combobox", { name: /Access method/i }), "Access method is required."],
    ];

    for (const [control, message] of cases) {
      const describedBy = control.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)).toHaveTextContent(message);
    }
  });

  it("drops aria-describedby on fields that have no error", async () => {
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await screen.findByText("Display name is required.");

    expect(screen.getByLabelText(/IP address/i)).not.toHaveAttribute("aria-describedby");
    expect(screen.getByLabelText(/Notes/i)).not.toHaveAttribute("aria-describedby");
  });

  it("focuses the first invalid field on a failed submit", async () => {
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await screen.findByText("Display name is required.");

    expect(screen.getByLabelText("Display name")).toHaveFocus();
  });

  it("focuses the first invalid field in RENDER order, not error-object order", async () => {
    renderSheet();
    await screen.findByLabelText("Display name");

    // Display name is valid here, so the first invalid control is the
    // Environment picker. This also pins the render-order-vs-EDITABLE_FIELDS
    // distinction that FIELD_DOM_ORDER exists to encode.
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Web 01" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await screen.findByText("Environment is required.");
    expect(screen.getByRole("combobox", { name: /Environment/i })).toHaveFocus();
  });

  it("focuses the field a server-side 400 blames", async () => {
    postMock.mockResolvedValue(
      apiError(400, "VALIDATION_ERROR", "Validation failed", {
        formErrors: [],
        fieldErrors: { hostname: ["String must contain at least 1 character(s)"] },
      })
    );
    renderSheet();

    await screen.findByLabelText("Display name");
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Web 01" } });
    fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("Access host"), { target: { value: "web-01.internal" } });

    const [environmentTrigger, serviceTypeTrigger, accessMethodTrigger] = screen.getAllByRole("combobox");
    fireEvent.click(environmentTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "Production" }));
    fireEvent.click(serviceTypeTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "Application" }));
    fireEvent.click(accessMethodTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "SSH" }));

    // Radix restores focus to the trigger when a Select closes, on a
    // setTimeout(0). Submitting before that lands would let the restore fire
    // *after* the submit's own focus call and steal it back — an artifact of
    // firing both in one tick, which two real user gestures cannot do. Wait
    // for the restore to settle so this asserts the component's behaviour
    // rather than the race.
    await waitFor(() => expect(accessMethodTrigger).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await screen.findByText("String must contain at least 1 character(s)");
    await waitFor(() => expect(screen.getByLabelText("Hostname")).toHaveFocus());
    expect(screen.getByLabelText("Hostname")).toHaveAttribute("aria-invalid", "true");
  });

  it("announces a non-field error through a role=alert banner", async () => {
    postMock.mockResolvedValue(apiError(500, "INTERNAL_ERROR", "Database unavailable"));
    renderSheet();

    await screen.findByLabelText("Display name");
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Web 01" } });
    fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: "web-01" } });
    fireEvent.change(screen.getByLabelText("Access host"), { target: { value: "web-01.internal" } });

    const [environmentTrigger, serviceTypeTrigger, accessMethodTrigger] = screen.getAllByRole("combobox");
    fireEvent.click(environmentTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "Production" }));
    fireEvent.click(serviceTypeTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "Application" }));
    fireEvent.click(accessMethodTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "SSH" }));

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Database unavailable");
  });
});

describe("ServerFormSheet — sheet chrome", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    toastMock.mockClear();
    getMock.mockResolvedValue(
      ok({ data: [SAMPLE_ENVIRONMENT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
    );
  });

  it("renders the three Select triggers in the documented order", async () => {
    renderSheet();
    await screen.findByLabelText("Display name");

    // Task 0 flagged the positional getAllByRole("combobox") destructuring
    // that the tests above rely on as fragile. The migration did not reorder
    // the pickers, so those tests keep working unchanged — this pins the
    // order so a future reshuffle fails here, loudly, instead of silently
    // driving the wrong control somewhere else in the file.
    const [environment, serviceType, accessMethod] = screen.getAllByRole("combobox");
    expect(environment).toHaveAttribute("id", "environment");
    expect(serviceType).toHaveAttribute("id", "service_type");
    expect(accessMethod).toHaveAttribute("id", "access_method");
  });

  it("closes without submitting when Cancel is clicked", async () => {
    const { onOpenChange } = renderSheet();
    await screen.findByLabelText("Display name");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(postMock).not.toHaveBeenCalled();
  });
});
