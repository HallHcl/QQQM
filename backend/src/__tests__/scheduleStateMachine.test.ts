import { canTransition } from "../services/scheduleStateMachine";

describe("canTransition — full transition matrix", () => {
  it("[1] pending -> in_progress = true", () => {
    expect(canTransition("pending", "in_progress")).toBe(true);
  });

  it("[2] pending -> done = false", () => {
    expect(canTransition("pending", "done")).toBe(false);
  });

  it("[3] pending -> cancelled = true", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
  });

  it("[4] in_progress -> done = true", () => {
    expect(canTransition("in_progress", "done")).toBe(true);
  });

  it("[5] in_progress -> pending = false", () => {
    expect(canTransition("in_progress", "pending")).toBe(false);
  });

  it("[6] done -> anything = false (terminal state)", () => {
    expect(canTransition("done", "pending")).toBe(false);
    expect(canTransition("done", "in_progress")).toBe(false);
    expect(canTransition("done", "cancelled")).toBe(false);
    expect(canTransition("done", "done")).toBe(false);
  });

  it("[7] cancelled -> anything = false (terminal state)", () => {
    expect(canTransition("cancelled", "pending")).toBe(false);
    expect(canTransition("cancelled", "in_progress")).toBe(false);
    expect(canTransition("cancelled", "done")).toBe(false);
    expect(canTransition("cancelled", "cancelled")).toBe(false);
  });

  it("in_progress -> cancelled = true", () => {
    expect(canTransition("in_progress", "cancelled")).toBe(true);
  });

  it("pending -> pending (no-op) = false", () => {
    expect(canTransition("pending", "pending")).toBe(false);
  });

  it("unknown 'from' state = false, never throws", () => {
    expect(canTransition("not_a_real_status", "pending")).toBe(false);
  });

  it("unknown 'to' state = false", () => {
    expect(canTransition("pending", "not_a_real_status")).toBe(false);
  });

  it("full matrix exhaustively: exactly the 4 legal edges exist and no others", () => {
    const statuses = ["pending", "in_progress", "done", "cancelled"];
    const legalEdges = new Set([
      "pending->in_progress",
      "pending->cancelled",
      "in_progress->done",
      "in_progress->cancelled",
    ]);

    for (const from of statuses) {
      for (const to of statuses) {
        const key = `${from}->${to}`;
        expect(canTransition(from, to)).toBe(legalEdges.has(key));
      }
    }
  });
});
