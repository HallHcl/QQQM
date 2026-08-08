import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectPicker } from "./ProjectPicker";

const getMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: { GET: (...args: unknown[]) => getMock(...args) },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const PROJECTS = [
  { id: "p1", name: "Migration" },
  { id: "p2", name: "Rollout" },
];

function mockOkResponse(data: typeof PROJECTS) {
  return {
    data: { data, pagination: { page: 1, per_page: 20, total: data.length, total_pages: 1 } },
    error: undefined,
    response: new Response(null, { status: 200 }),
  };
}

describe("ProjectPicker", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue(mockOkResponse(PROJECTS));
  });

  it("renders options from useProjects", async () => {
    render(<ProjectPicker value={undefined} onChange={vi.fn()} />, { wrapper });

    fireEvent.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Migration")).toBeInTheDocument();
    expect(screen.getByText("Rollout")).toBeInTheDocument();
  });

  it("fires onChange with the selected project id", async () => {
    const onChange = vi.fn();
    render(<ProjectPicker value={undefined} onChange={onChange} />, { wrapper });

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Rollout"));

    expect(onChange).toHaveBeenCalledWith("p2");
  });

  it("passes clientId through to useProjects for scoping", async () => {
    render(<ProjectPicker value={undefined} onChange={vi.fn()} clientId="c1" />, { wrapper });

    expect(getMock).toHaveBeenCalledTimes(1);
    const [, options] = getMock.mock.calls[0];
    expect(options.params.query.client_id).toBe("c1");
  });

  it("without includeAllOption, does not render an all-projects item", async () => {
    render(<ProjectPicker value={undefined} onChange={vi.fn()} />, { wrapper });

    fireEvent.click(screen.getByRole("combobox"));

    await screen.findByText("Migration");
    expect(screen.queryByText(/all projects/i)).not.toBeInTheDocument();
  });

  it("with includeAllOption, renders the all-option item and maps it to undefined", async () => {
    const onChange = vi.fn();
    render(
      <ProjectPicker value="p1" onChange={onChange} includeAllOption allOptionLabel="All projects" />,
      { wrapper }
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("All projects"));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("with includeAllOption and value=undefined, selects the all-option as the current value", async () => {
    render(
      <ProjectPicker value={undefined} onChange={vi.fn()} includeAllOption allOptionLabel="All projects" />,
      { wrapper }
    );

    expect(await screen.findByText("All projects")).toBeInTheDocument();
  });
});
