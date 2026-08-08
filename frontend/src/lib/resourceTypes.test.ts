import { describe, expect, it } from "vitest";
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPES, validateResourceContentFields } from "./resourceTypes";

describe("RESOURCE_TYPES", () => {
  it("has exactly the 7 real values verified from the backend enum (not the 5-value list from earlier docs)", () => {
    expect(RESOURCE_TYPES).toEqual([
      "runbook",
      "sop",
      "architecture",
      "troubleshooting",
      "faq",
      "link",
      "pdf",
    ]);
  });

  it("has a label for every type", () => {
    for (const type of RESOURCE_TYPES) {
      expect(RESOURCE_TYPE_LABELS[type]).toBeTruthy();
    }
  });
});

describe("validateResourceContentFields", () => {
  it.each(["runbook", "sop", "troubleshooting", "faq"] as const)(
    "requires non-empty content for type %s",
    (type) => {
      expect(validateResourceContentFields(type, "", "").content).toBeDefined();
      expect(validateResourceContentFields(type, "some content", "").content).toBeUndefined();
    }
  );

  it.each(["architecture", "pdf"] as const)(
    "has no content requirement for type %s",
    (type) => {
      expect(validateResourceContentFields(type, "", "").content).toBeUndefined();
    }
  );

  it("requires a non-empty external_url for type link", () => {
    expect(validateResourceContentFields("link", "", "").external_url).toBeDefined();
  });

  it("rejects a non-https external_url for type link", () => {
    expect(
      validateResourceContentFields("link", "", "http://example.com").external_url
    ).toBeDefined();
  });

  it("accepts a valid https external_url for type link", () => {
    expect(
      validateResourceContentFields("link", "", "https://example.com").external_url
    ).toBeUndefined();
  });

  it("has no external_url requirement for non-link types", () => {
    expect(validateResourceContentFields("runbook", "some content", "").external_url).toBeUndefined();
  });
});
