import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServerFormDialog from "./ServerFormDialog";

// This file's tests each drive several sequential Radix `Select` interactions
// (open -> portal render/position -> option find -> click, repeated for the
// Environment/Service type/Access method pickers) on top of react-hook-form
// validation and React Query. That's the most cumulative async UI work of
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

function renderDialog(server?: typeof SAMPLE_SERVER) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ServerFormDialog open onOpenChange={onOpenChange} server={server} />
    </QueryClientProvider>
  );
  return { onOpenChange, invalidateSpy };
}

describe("ServerFormDialog — create", () => {
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
    const { onOpenChange } = renderDialog();

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
    renderDialog();
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
    const { onOpenChange, invalidateSpy } = renderDialog();

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
    renderDialog();

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

describe("ServerFormDialog — edit", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
    getMock.mockImplementation((path: string) => {
      if (path === "/api/environments") {
        return Promise.resolve(
          ok({ data: [SAMPLE_ENVIRONMENT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
        );
      }
      if (path === "/api/servers/{id}") {
        return Promise.resolve(ok(SAMPLE_SERVER));
      }
      throw new Error(`Unexpected path: ${path}`);
    });
  });

  it("pre-fills the form from the loaded record, with the environment locked (no EnvironmentPicker rendered)", async () => {
    renderDialog(SAMPLE_SERVER);
    expect(screen.getByLabelText("Display name")).toHaveValue("Web 01");
    expect(screen.getByLabelText("Hostname")).toHaveValue("web-01");
    expect(
      await screen.findByText("A server's environment can't be changed after creation.")
    ).toBeInTheDocument();
    // Only service_type + access_method comboboxes remain — the create-only
    // EnvironmentPicker combobox must not be rendered on edit.
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(await screen.findByDisplayValue("Production")).toBeDisabled();
  });

  it("sends updated_at and never sends environment_id in the PATCH body", async () => {
    patchMock.mockResolvedValue(ok({ ...SAMPLE_SERVER, hostname: "web-01-renamed" }));
    const { onOpenChange } = renderDialog(SAMPLE_SERVER);

    await screen.findByDisplayValue("web-01");
    fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: "web-01-renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const [path, options] = patchMock.mock.calls[0];
    expect(path).toBe("/api/servers/{id}");
    expect(options.params).toEqual({ path: { id: "s1" } });
    expect(options.body).toMatchObject({
      hostname: "web-01-renamed",
      updated_at: SAMPLE_SERVER.updated_at,
    });
    expect(options.body.environment_id).toBeUndefined();
  });

  it("shows the conflict UI (not a generic error) on a stale-write 409, and does not lose the user's edit", async () => {
    patchMock.mockResolvedValueOnce(
      apiError(409, "CONFLICT", "Server was modified by someone else; refresh and try again")
    );
    renderDialog(SAMPLE_SERVER);

    await screen.findByDisplayValue("web-01");
    fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: "My In-Progress Edit" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("This record changed")).toBeInTheDocument();
    expect(
      screen.getByText("Server was modified by someone else; refresh and try again")
    ).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();

    const freshRecord = { ...SAMPLE_SERVER, updated_at: "2026-01-03T00:00:00.000Z" };
    getMock.mockImplementation((path: string) => {
      if (path === "/api/servers/{id}") return Promise.resolve(ok(freshRecord));
      return Promise.resolve(
        ok({ data: [SAMPLE_ENVIRONMENT], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } })
      );
    });
    patchMock.mockResolvedValueOnce(ok({ ...freshRecord, hostname: "My In-Progress Edit" }));

    fireEvent.click(screen.getByRole("button", { name: /keep my changes/i }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(2));
    const [, retryOptions] = patchMock.mock.calls[1];
    expect(retryOptions.body).toMatchObject({
      hostname: "My In-Progress Edit",
      updated_at: freshRecord.updated_at,
    });
  });

  it("does NOT route a generic 409 to a duplicate-name field (no unique index exists on servers; every 409 here is a stale-write conflict)", async () => {
    patchMock.mockResolvedValueOnce(apiError(409, "CONFLICT", "A conflicting server already exists"));
    renderDialog(SAMPLE_SERVER);

    await screen.findByDisplayValue("web-01");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("This record changed")).toBeInTheDocument();
  });

  it("shows an error toast for an unexpected (non-conflict) failure", async () => {
    patchMock.mockResolvedValue(apiError(500, "INTERNAL", "boom"));
    renderDialog(SAMPLE_SERVER);

    await screen.findByDisplayValue("web-01");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Couldn't update server",
        description: "boom",
        variant: "destructive",
      });
    });
  });
});
