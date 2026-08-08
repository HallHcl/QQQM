import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useHasRole } from "./useHasRole";

const useAuthMock = vi.fn();

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

describe("useHasRole", () => {
  it("returns true when the user has the required role", () => {
    useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
    const { result } = renderHook(() => useHasRole("admin"));
    expect(result.current).toBe(true);
  });

  it("returns false when a member checks for the admin role", () => {
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
    const { result } = renderHook(() => useHasRole("admin"));
    expect(result.current).toBe(false);
  });

  it("returns true when a member checks for the member role", () => {
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
    const { result } = renderHook(() => useHasRole("member"));
    expect(result.current).toBe(true);
  });

  it("returns true if the user holds any one of several accepted roles", () => {
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
    const { result } = renderHook(() => useHasRole(["admin", "member"]));
    expect(result.current).toBe(true);
  });

  it("returns false when unauthenticated (no roles)", () => {
    useAuthMock.mockReturnValue({ roles: [], isLoading: false });
    const { result } = renderHook(() => useHasRole("admin"));
    expect(result.current).toBe(false);
  });

  it("returns false while auth is still loading, even if the eventual roles would match", () => {
    useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: true });
    const { result } = renderHook(() => useHasRole("admin"));
    expect(result.current).toBe(false);
  });
});
