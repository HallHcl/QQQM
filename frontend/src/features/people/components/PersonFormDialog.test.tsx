import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PersonFormDialog from "./PersonFormDialog";
import type { Person } from "@/types";

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

const SAMPLE_PERSON: Person = {
  id: "1",
  name: "Alex Rivera",
  email: "alex@example.com",
  phone: "555-0100",
  type: "internal_engineer",
  notes: "Backend specialist",
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

function renderDialog(person?: Person) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <PersonFormDialog open onOpenChange={onOpenChange} person={person} />
    </QueryClientProvider>
  );
  return { onOpenChange, invalidateSpy };
}

describe("PersonFormDialog — create", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
  });

  it("associates the Type label with its select trigger for screen readers", () => {
    renderDialog();
    expect(screen.getByLabelText("Type")).toHaveAttribute("role", "combobox");
  });

  it("blocks submit with a client-side error when name is empty", async () => {
    const { onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("submits exactly name/email/phone/type/notes and invalidates the people query on success", async () => {
    postMock.mockResolvedValue(created(SAMPLE_PERSON));
    const { onOpenChange, invalidateSpy } = renderDialog();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Person" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "555-0199" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Some notes" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/people");
    expect(options.body).toEqual({
      name: "New Person",
      email: "new@example.com",
      phone: "555-0199",
      type: "internal_engineer",
      notes: "Some notes",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["people"] });
    expect(toastMock).toHaveBeenCalledWith({ title: "Person created" });
  });

  it("sends the selected type from the dropdown", async () => {
    postMock.mockResolvedValue(created(SAMPLE_PERSON));
    renderDialog();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Vendor Person" } });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Vendor" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock.mock.calls[0][1].body).toMatchObject({ type: "vendor" });
  });

  it("surfaces a server-side validation error against the relevant field", async () => {
    postMock.mockResolvedValue(
      apiError(400, "VALIDATION_ERROR", "Validation failed", {
        formErrors: [],
        fieldErrors: { email: ["Invalid email"] },
      })
    );
    renderDialog();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Someone" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Invalid email")).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({
      title: "Couldn't create person",
      description: "Check the highlighted fields below.",
      variant: "destructive",
    });
  });
});

describe("PersonFormDialog — edit", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
    getMock.mockResolvedValue(ok(SAMPLE_PERSON));
  });

  it("pre-fills the form from the loaded record", () => {
    renderDialog(SAMPLE_PERSON);
    expect(screen.getByLabelText("Name")).toHaveValue("Alex Rivera");
    expect(screen.getByLabelText("Email")).toHaveValue("alex@example.com");
    expect(screen.getByLabelText("Phone")).toHaveValue("555-0100");
    expect(screen.getByLabelText("Notes")).toHaveValue("Backend specialist");
  });

  it("sends updated_at from the loaded record in the PATCH body on submit", async () => {
    patchMock.mockResolvedValue(ok({ ...SAMPLE_PERSON, name: "Alex Rivera Jr." }));
    const { onOpenChange } = renderDialog(SAMPLE_PERSON);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alex Rivera Jr." } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const [path, options] = patchMock.mock.calls[0];
    expect(path).toBe("/api/people/{id}");
    expect(options.params).toEqual({ path: { id: "1" } });
    expect(options.body).toMatchObject({
      name: "Alex Rivera Jr.",
      updated_at: SAMPLE_PERSON.updated_at,
    });
  });

  it("shows the conflict UI instead of a generic error on a 409, and does not lose the user's edit", async () => {
    patchMock.mockResolvedValueOnce(
      apiError(409, "CONFLICT", "Person was modified by someone else; refresh and try again")
    );
    renderDialog(SAMPLE_PERSON);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My In-Progress Edit" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("This record changed")).toBeInTheDocument();
    expect(
      screen.getByText("Person was modified by someone else; refresh and try again")
    ).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();

    const freshRecord = { ...SAMPLE_PERSON, updated_at: "2026-01-03T00:00:00.000Z" };
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
      apiError(409, "CONFLICT", "Person was modified by someone else; refresh and try again")
    );
    renderDialog(SAMPLE_PERSON);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My In-Progress Edit" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("This record changed")).toBeInTheDocument();

    const freshRecord = {
      ...SAMPLE_PERSON,
      name: "Alex Rivera (renamed by someone else)",
      updated_at: "2026-01-03T00:00:00.000Z",
    };
    getMock.mockResolvedValueOnce(ok(freshRecord));

    fireEvent.click(screen.getByRole("button", { name: /reload latest version/i }));

    await waitFor(() => expect(screen.queryByText("This record changed")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Name")).toHaveValue("Alex Rivera (renamed by someone else)");
  });

  it("shows an error toast for an unexpected (non-conflict) failure", async () => {
    patchMock.mockResolvedValue(apiError(500, "INTERNAL", "boom"));
    renderDialog(SAMPLE_PERSON);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alex Rivera Jr." } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Couldn't update person",
        description: "boom",
        variant: "destructive",
      });
    });
  });
});
