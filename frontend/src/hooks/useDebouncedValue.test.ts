import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./useDebouncedValue";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDebouncedValue", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("acme", 250));
    expect(result.current).toBe("acme");
  });

  it("does not update until the delay has elapsed", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "ab" });
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("ab");
  });

  it("collapses a burst of keystrokes into a single settled value", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: "" } }
    );

    // Type "acme" one character at a time, faster than the delay.
    for (const value of ["a", "ac", "acm", "acme"]) {
      rerender({ value });
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }

    // Nothing has settled yet: every keystroke reset the timer.
    expect(result.current).toBe("");

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe("acme");
  });
});
