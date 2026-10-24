// Wristband pairing codes: the band shows and speaks a 6-digit code, and the
// family member types it into the setup wizard.

export const PAIRING_CODE_TTL_MS = 15 * 60_000;

/** A 6-digit code (leading zeros kept) from one random 32-bit value. */
export function pairingCodeFrom(random: Uint32Array): string {
  return String(random[0] % 1_000_000).padStart(6, "0");
}

export function newPairingCode(): string {
  return pairingCodeFrom(crypto.getRandomValues(new Uint32Array(1)));
}

/** Strip spaces and dashes; null unless exactly six digits remain. */
export function normalizePairingCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function formatPairingCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** Digits read one by one, with a pause between the two halves. */
export function spokenPairingCode(code: string): string {
  const half = (s: string) => s.split("").join(", ");
  return `${half(code.slice(0, 3))}. ${half(code.slice(3))}`;
}
