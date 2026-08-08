import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { useConflictResolution } from "./useConflictResolution";

describe("useConflictResolution", () => {
  it("starts with no conflict", () => {
    const { result } = renderHook(() => useConflictResolution());
    expect(result.current.isConflict).toBe(false);
    expect(result.current.conflict).toBeNull();
  });

  it("captures a 409 ApiError, exposing its message and details", () => {
    const { result } = renderHook(() => useConflictResolution());
    const serverDetails = { current: { updated_at: "2026-08-08T00:00:00.000Z" } };
    const error = new ApiError(409, "Record changed since it was loaded", "CONFLICT", serverDetails);

    let captured = false;
    act(() => {
      captured = result.current.captureConflict(error);
    });

    expect(captured).toBe(true);
    expect(result.current.isConflict).toBe(true);
    expect(result.current.conflict?.message).toBe("Record changed since it was loaded");
    expect(result.current.conflict?.details).toEqual(serverDetails);
  });

  it("ignores non-409 ApiErrors, leaving state untouched", () => {
    const { result } = renderHook(() => useConflictResolution());

    let captured = true;
    act(() => {
      captured = result.current.captureConflict(new ApiError(404, "Not found"));
    });

    expect(captured).toBe(false);
    expect(result.current.isConflict).toBe(false);
    expect(result.current.conflict).toBeNull();
  });

  it("ignores non-ApiError values", () => {
    const { result } = renderHook(() => useConflictResolution());

    let captured = true;
    act(() => {
      captured = result.current.captureConflict(new Error("network down"));
    });

    expect(captured).toBe(false);
    expect(result.current.isConflict).toBe(false);
  });

  it("does not auto-retry or auto-clear on capture — state persists until clearConflict is called explicitly", () => {
    const { result } = renderHook(() => useConflictResolution());

    act(() => {
      result.current.captureConflict(new ApiError(409, "Record changed"));
    });
    expect(result.current.isConflict).toBe(true);

    // Capturing again with the same conflict does not silently discard it.
    act(() => {
      result.current.captureConflict(new ApiError(409, "Record changed"));
    });
    expect(result.current.isConflict).toBe(true);
  });

  it("clearConflict resets state", () => {
    const { result } = renderHook(() => useConflictResolution());

    act(() => {
      result.current.captureConflict(new ApiError(409, "Record changed"));
    });
    expect(result.current.isConflict).toBe(true);

    act(() => result.current.clearConflict());
    expect(result.current.isConflict).toBe(false);
    expect(result.current.conflict).toBeNull();
  });
});
