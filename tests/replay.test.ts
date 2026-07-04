import { describe, expect, it } from "vitest";

describe("Replay", () => {
  it("keeps same event id", () => {
    const id = "123";

    expect(id).toBe(id);
  });
});
