// Cartesia's /tts/bytes WAV output uses the streaming placeholder 0xFFFFFFFF
// for the RIFF and data chunk sizes. Browsers mostly cope, but strict parsers
// (Safari, MCU WAV players on the wearable) need real sizes.

const RIFF_HEADER_BYTES = 12; // "RIFF" <size> "WAVE"
const CHUNK_HEADER_BYTES = 8; // <id> <size>

/** Returns a copy of `wav` with the RIFF and data chunk sizes set from its real length. */
export function fixWavSizes(wav: ArrayBuffer): ArrayBuffer {
  const out = wav.slice(0);
  const view = new DataView(out);
  const ascii = (offset: number) =>
    String.fromCharCode(...new Uint8Array(out, offset, 4));

  if (out.byteLength < RIFF_HEADER_BYTES || ascii(0) !== "RIFF" || ascii(8) !== "WAVE") {
    return out; // not a WAV; leave untouched
  }
  view.setUint32(4, out.byteLength - CHUNK_HEADER_BYTES, true);

  let offset = RIFF_HEADER_BYTES;
  while (offset + CHUNK_HEADER_BYTES <= out.byteLength) {
    const id = ascii(offset);
    const dataStart = offset + CHUNK_HEADER_BYTES;
    if (id === "data") {
      view.setUint32(offset + 4, out.byteLength - dataStart, true);
      break;
    }
    const size = view.getUint32(offset + 4, true);
    offset = dataStart + size + (size % 2); // chunks are word-aligned
  }
  return out;
}
