import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";

const setTokenMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/lib/authToken", () => ({
  setToken: (...args: unknown[]) => setTokenMock(...args),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

describe("handleGlobalApiError", () => {
  beforeEach(() => {
    // The module tracks a `redirectingToLogin` guard in module state, so
    // each test needs a fresh module instance to observe redirect behavior
    // in isolation.
    vi.resetModules();
    setTokenMock.mockClear();
    toastMock.mockClear();
    Object.defineProperty(window, "location", {
      value: { pathname: "/overview", assign: vi.fn() },
      writable: true,
    });
  });

  it("401: clears the auth token and redirects to /login", async () => {
    const { handleGlobalApiError } = await import("./errorHandler");
    handleGlobalApiError(new ApiError(401, "Session expired"));

    expect(setTokenMock).toHaveBeenCalledWith(null);
    expect(window.location.assign).toHaveBeenCalledWith("/login");
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("403: shows a not-permitted toast and does not redirect", async () => {
    const { handleGlobalApiError } = await import("./errorHandler");
    handleGlobalApiError(new ApiError(403, "You lack the admin role"));

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toMatchObject({
      title: "Not permitted",
      variant: "destructive",
    });
    expect(setTokenMock).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("404: is not handled globally — left for the calling component", async () => {
    const { handleGlobalApiError } = await import("./errorHandler");
    handleGlobalApiError(new ApiError(404, "Client not found"));

    expect(setTokenMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("409: is not auto-resolved or redirected — left for the conflict primitive", async () => {
    const { handleGlobalApiError } = await import("./errorHandler");
    handleGlobalApiError(new ApiError(409, "Record changed since it was loaded"));

    expect(setTokenMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("401 on /login itself does not redirect again", async () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/login", assign: vi.fn() },
      writable: true,
    });
    const { handleGlobalApiError } = await import("./errorHandler");
    handleGlobalApiError(new ApiError(401, "Invalid credentials"));

    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
