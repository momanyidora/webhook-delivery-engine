import { describe, it, expect } from "vitest";
import { getNextAttemptTime } from "../src/services/retryService";

describe("Retry Schedule", () => {
  it("returns first retry", () => {
    expect(getNextAttemptTime(1)).toBeInstanceOf(Date);
  });

  it("returns second retry", () => {
    expect(getNextAttemptTime(2)).toBeInstanceOf(Date);
  });

  it("returns third retry", () => {
    expect(getNextAttemptTime(3)).toBeInstanceOf(Date);
  });

  it("returns fourth retry", () => {
    expect(getNextAttemptTime(4)).toBeInstanceOf(Date);
  });

  it("returns null after fifth attempt", () => {
    expect(getNextAttemptTime(5)).toBeNull();
  });
});
