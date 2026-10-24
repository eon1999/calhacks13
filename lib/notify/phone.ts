// Phone numbers for text alerts. Stored and sent in E.164 ("+14155550123"),
// which is what Twilio expects. Bare 10-digit numbers are taken as US/Canada.

const E164 = /^\+[1-9]\d{7,14}$/;

/** Normalise what someone typed into E.164, or null if it isn't a phone number. */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /[a-z@]/i.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return E164.test(`+${digits}`) ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** "+14155550123" → "•••• 0123", for showing who was texted without the whole number. */
export function maskPhone(e164: string): string {
  return `•••• ${e164.slice(-4)}`;
}
