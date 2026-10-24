import { describe, expect, it } from "vitest";
import { formatPairingCode, normalizePairingCode, pairingCodeFrom, spokenPairingCode } from "./pairing";

describe("pairingCodeFrom", () => {
  it("makes a 6-digit code from random bytes, keeping leading zeros", () => {
    expect(pairingCodeFrom(new Uint32Array([0]))).toBe("000000");
    expect(pairingCodeFrom(new Uint32Array([482913]))).toBe("482913");
    expect(pairingCodeFrom(new Uint32Array([1_482_913]))).toBe("482913");
  });
});

describe("normalizePairingCode", () => {
  it("accepts spaces and dashes", () => {
    expect(normalizePairingCode("482 913")).toBe("482913");
    expect(normalizePairingCode("482-913")).toBe("482913");
  });

  it("rejects anything that isn't six digits", () => {
    expect(normalizePairingCode("48291")).toBeNull();
    expect(normalizePairingCode("48291a")).toBeNull();
  });
});

describe("formatting", () => {
  it("groups digits for display and spells them for speech", () => {
    expect(formatPairingCode("482913")).toBe("482 913");
    expect(spokenPairingCode("482913")).toBe("4, 8, 2. 9, 1, 3");
  });
});
