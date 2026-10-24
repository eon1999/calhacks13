import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CLAUDE_MODEL } from "../voice/config";

// Reads a photo of a prescription label into the setup wizard's medication form.

export const SCAN_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ScanMediaType = (typeof SCAN_MEDIA_TYPES)[number];

export const scannedMedication = z.object({
  readable: z.boolean().describe("False if the photo isn't a medicine label or the name can't be read."),
  name: z.string().describe("Medicine name as printed, e.g. 'Oxycodone' or 'Cephalexin'."),
  doseLabel: z.string().describe("Strength and amount per dose, e.g. '5 mg, 1 tablet'."),
  times: z
    .array(z.string())
    .describe("Suggested daily times as HH:mm (24h), spread across waking hours, from the label's frequency."),
  instructions: z.string().describe("Short directions worth remembering, e.g. 'take with food'. Empty if none."),
});
export type ScannedMedication = z.infer<typeof scannedMedication>;

const PROMPT = `This is a photo of a prescription or medicine label for someone recovering at home after surgery.
Read the medicine name, the strength and amount per dose, and how often to take it.
Turn the frequency into concrete times between 08:00 and 21:00 (for example, "twice daily" is 08:00 and 20:00, "every 6 hours" is 08:00, 14:00, 20:00). For "as needed" medicines, return an empty times list.
Copy what is printed; don't guess at anything you can't read.`;

let anthropic: Anthropic | null = null;
function claude(): Anthropic {
  anthropic ??= new Anthropic();
  return anthropic;
}

export class UnreadableLabelError extends Error {
  constructor() {
    super("Couldn't read a medicine label in that photo");
    this.name = "UnreadableLabelError";
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function scanMedicationLabel(imageBase64: string, mediaType: ScanMediaType): Promise<ScannedMedication> {
  const response = await claude().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    output_config: { effort: "low", format: betaZodOutputFormat(scannedMedication) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  const result = response.stop_reason === "refusal" ? null : response.parsed_output;
  if (!result || !result.readable || !result.name.trim()) throw new UnreadableLabelError();
  return { ...result, times: result.times.filter((t) => HHMM.test(t)) };
}
