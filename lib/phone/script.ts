// What the Cartesia phone agent says. Cartesia runs the live conversation, so
// WELCOME_MESSAGE and INSTRUCTIONS are pasted into the agent's settings in the
// Cartesia dashboard (Playground). Each {{variable}} is filled per call from
// callVariables() / urgentCallVariables() below.

/** First thing the agent says when someone picks up: who it's about, then the problem. */
export const WELCOME_MESSAGE =
  "Hi {{contact_name}}, this is Cadence with an urgent alert about {{patient_name}}. {{reason_line}}";

/** The agent's system prompt in the Cartesia dashboard. */
export const INSTRUCTIONS = `You are Cadence, calling {{contact_name}} with an urgent alert about {{patient_name}}, who is recovering at home.
The problem: {{reason_line}}
- Say the problem plainly, once, then repeat it if they ask. Keep every reply to one or two short sentences.
- You only know what is in the alert. Don't guess, diagnose or give medical advice.
- If it sounds like an emergency, tell them to call 911.
- If they want to reach the family, the number is {{callback_number}}.
- TODO: what to say on voicemail.`;

/** Lines for manual calls from POST /api/phone/call. Urgent-alert calls read the alert's own reason instead. */
export const CALL_REASONS = {
  fall: "TODO: one sentence explaining a fall was detected",
  urgent_alert: "TODO: one sentence explaining the patient asked for help",
  missed_doses: "TODO: one sentence explaining doses were missed",
  check_in: "TODO: one sentence for a routine check-in call",
} as const;

export type CallReason = keyof typeof CALL_REASONS;

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

/** Variables for an urgent-alert call: the alert's reason is read out as-is. */
export function urgentCallVariables(args: {
  patientName: string;
  contactName: string;
  problem: string;
  callbackNumber?: string;
}): CallVariables {
  return {
    patient_name: args.patientName,
    contact_name: args.contactName,
    reason_line: args.problem.replace(/\s+/g, " ").trim(),
    callback_number: args.callbackNumber ?? DEFAULT_CALLBACK_NUMBER,
  };
}
