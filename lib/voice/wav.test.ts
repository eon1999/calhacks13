import { describe, expect, it } from "vitest";
import { fixWavSizes } from "./wav";

const PLACEHOLDER = 0xffffffff;

/** Minimal WAV like Cartesia's: fmt + LIST + data with placeholder sizes. */
function cartesiaStyleWav(pcmBytes: number): ArrayBuffer {
  const chunks: [string, number, number][] = [
    ["fmt ", 16, 16],
    ["LIST", 26, 26],
    ["data", PLACEHOLDER, pcmBytes],
  ];
  const total = 12 + chunks.reduce((n, [, , len]) => n + 8 + len, 0);
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  const write = (at: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, PLACEHOLDER, true);
  write(8, "WAVE");
  let at = 12;
  for (const [id, size, len] of chunks) {
    write(at, id);
    view.setUint32(at + 4, size, true);
    at += 8 + len;
  }
  return buf;
}

describe("fixWavSizes", () => {
  it("sets RIFF and data sizes from the real length", () => {
    const fixed = new DataView(fixWavSizes(cartesiaStyleWav(1000)));
    expect(fixed.getUint32(4, true)).toBe(fixed.byteLength - 8);
    // data chunk header sits after RIFF(12) + fmt(8+16) + LIST(8+26) = 70
    expect(fixed.getUint32(74, true)).toBe(1000);
  });

  it("does not mutate the input", () => {
    const original = cartesiaStyleWav(10);
    fixWavSizes(original);
    expect(new DataView(original).getUint32(4, true)).toBe(PLACEHOLDER);
  });

  it("leaves non-WAV data untouched", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(new Uint8Array(fixWavSizes(bytes.buffer))).toEqual(bytes);
  });
});
