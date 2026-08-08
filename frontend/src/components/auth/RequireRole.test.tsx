import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RequireRole } from "./RequireRole";

const useAuthMock = vi.fn();

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

describe("RequireRole", () => {
  it("renders children when the user has the required role", () => {
    useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
    render(
      <RequireRole roles={["admin"]}>
        <div>Delete</div>
      </RequireRole>
    );
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("renders nothing when the user lacks the required role and no fallback is given", () => {
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
    const { container } = render(
      <RequireRole roles={["admin"]}>
        <div>Delete</div>
      </RequireRole>
    );
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the fallback when the role does not match and a fallback is given", () => {
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
    render(
      <RequireRole roles={["admin"]} fallback={<div>Not permitted</div>}>
        <div>Delete</div>
      </RequireRole>
    );
    expect(screen.getByText("Not permitted")).toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("renders nothing while auth is loading, ignoring fallback, so nothing flashes prematurely", () => {
    useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: true });
    const { container } = render(
      <RequireRole roles={["admin"]} fallback={<div>Not permitted</div>}>
        <div>Delete</div>
      </RequireRole>
    );
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(screen.queryByText("Not permitted")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("accepts multiple roles and renders children if any one matches", () => {
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
    render(
      <RequireRole roles={["admin", "member"]}>
        <div>Edit</div>
      </RequireRole>
    );
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });
});
