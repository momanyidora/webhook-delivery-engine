import { describe, expect, it } from "vitest";
import { generateSignature } from "../src/services/signatureService";

describe("HMAC", () => {
  it("generates a signature", () => {
    const signature = generateSignature({
      orderId: 1,
    });

    expect(signature).toBeDefined();
    expect(signature.length).toBeGreaterThan(0);
  });
});
