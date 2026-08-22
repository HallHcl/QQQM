import { describe, expect, it } from "vitest";
import { getInitials } from "./initials";

describe("getInitials", () => {
  it("takes the first letter of each of the first two words", () => {
    expect(getInitials("Brightwater Logistics")).toBe("BL");
    expect(getInitials("Acme Corporation")).toBe("AC");
  });

  it("uses the first two letters of a single-word name", () => {
    expect(getInitials("Acme")).toBe("AC");
    expect(getInitials("X")).toBe("X");
  });

  it("ignores a third+ word", () => {
    expect(getInitials("Northwind Traders Ltd")).toBe("NT");
  });

  it("is case-insensitive on input but always uppercases the result", () => {
    expect(getInitials("brightwater logistics")).toBe("BL");
  });

  it("collapses repeated/leading/trailing whitespace between words", () => {
    expect(getInitials("  Old   Co  ")).toBe("OC");
  });

  it("is deterministic across repeated calls with the same name", () => {
    expect(getInitials("Acme Corp")).toBe(getInitials("Acme Corp"));
  });

  it("falls back to a placeholder for an empty or blank name", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });
});
