// What the Cartesia phone agent says. Cartesia runs the live conversation, so
// WELCOME_MESSAGE and INSTRUCTIONS are pasted into the agent's settings in the
// Cartesia dashboard (Playground). Each {{variable}} is filled per call from
// callVariables() below.
// TODO(script): replace every placeholder in this file with the real wording.

/** Why Cadence is calling. Each reason maps to one line the agent reads out. */
export const CALL_REASONS = {
  fall: "TODO: one sentence explaining a fall was detected",
  urgent_alert: "TODO: one sentence explaining the patient asked for help",
  missed_doses: "TODO: one sentence explaining doses were missed",
  check_in: "TODO: one sentence for a routine check-in call",
} as const;

export type CallReason = keyof typeof CALL_REASONS;

/** First thing the agent says when someone picks up. */
export const WELCOME_MESSAGE =
  "TODO: Hi {{contact_name}}, this is Cadence calling about {{patient_name}}. {{reason_line}}";

/** The agent's system prompt in the Cartesia dashboard. */
export const INSTRUCTIONS = `TODO: write the phone agent's instructions.

Things it will probably need to cover:
- Who it is: Cadence, calling on behalf of {{patient_name}}'s care team.
- Why it's calling: {{reason_line}}
- What it wants from {{contact_name}}: TODO (e.g. confirm they can check on {{patient_name}})
- What to do on voicemail: TODO
- How they can reach the family: {{callback_number}}
- Boundaries: not a doctor, no medical advice, tell them to call 911 for emergencies.`;

/** Values sent to Cartesia as dynamic variables; names must match the {{placeholders}} above. */
export interface CallVariables extends Record<string, string> {
  patient_name: string;
  contact_name: string;
  reason_line: string;
  callback_number: string;
}

// TODO(script): the number contacts should call back on. Placeholder for now.
export const DEFAULT_CALLBACK_NUMBER = "+15555550100";

export function callVariables(args: {
  patientName: string;
  contactName: string;
  reason: CallReason;
  callbackNumber?: string;
}): CallVariables {
  return {
    patient_name: args.patientName,
    contact_name: args.contactName,
    reason_line: CALL_REASONS[args.reason],
    callback_number: args.callbackNumber ?? DEFAULT_CALLBACK_NUMBER,
  };
}
