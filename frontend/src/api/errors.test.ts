import { describe, expect, it } from "vitest";
import { ApiError, parseApiError } from "./errors";

describe("parseApiError", () => {
  it("uses the server-provided code and message when present", () => {
    const err = parseApiError(400, { error: { code: "VALIDATION_ERROR", message: "Name is required" } });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("Name is required");
  });

  it("tolerates a missing `code` field (known 404 backend gap) and keeps the server message", () => {
    const err = parseApiError(404, { error: { message: "resource not found" } });
    expect(err.code).toBeUndefined();
    expect(err.message).toBe("resource not found");
  });

  it("tolerates a missing `code` field (known 500 backend gap) and falls back to a generic message", () => {
    const err = parseApiError(500, { error: {} });
    expect(err.code).toBeUndefined();
    expect(err.message).toMatch(/server/i);
  });

  it("falls back to a generic message when the body is missing entirely", () => {
    const err = parseApiError(500, undefined);
    expect(err.code).toBeUndefined();
    expect(err.message).toMatch(/server/i);
  });

  it("falls back to a generic message when the body is malformed", () => {
    const err = parseApiError(401, "not json");
    expect(err.message).toMatch(/session/i);
  });

  it("falls back to a status-coded message for statuses with no canned copy", () => {
    const err = parseApiError(418, {});
    expect(err.message).toContain("418");
  });
});
