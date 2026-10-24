// Sends one SMS through Twilio's REST API with plain fetch (no SDK), so it runs
// inside a Convex action. Credentials are Convex env vars:
//   npx convex env set TWILIO_ACCOUNT_SID AC...
//   npx convex env set TWILIO_AUTH_TOKEN ...
//   npx convex env set TWILIO_FROM +1...      (or a Messaging Service SID, MG...)
// Twilio trial accounts can't send custom text, only Twilio's predefined
// templates (error 572006). For a trial, also set e.g.
//   npx convex env set TWILIO_TRIAL_TEMPLATE sms_internal_alerts
// and that template goes out in place of Cadence's message (which is still logged).

const TWILIO_API = "https://api.twilio.com/2010-04-01";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
  /** Predefined template sent instead of our text, for trial accounts. */
  trialTemplate?: string;
}

export type SmsResult = { ok: true; sid: string } | { ok: false; error: string };

/** Twilio settings from the environment, or null when texting isn't set up (dry run). */
export function twilioConfig(env: Record<string, string | undefined>): TwilioConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM;
  if (!accountSid || !authToken || !from) return null;
  const trialTemplate = env.TWILIO_TRIAL_TEMPLATE;
  return trialTemplate ? { accountSid, authToken, from, trialTemplate } : { accountSid, authToken, from };
}

export async function sendSms(config: TwilioConfig, to: string, body: string): Promise<SmsResult> {
  const form = new URLSearchParams({ To: to, Body: config.trialTemplate ?? body });
  // A Messaging Service picks the sending number itself.
  form.set(config.from.startsWith("MG") ? "MessagingServiceSid" : "From", config.from);

  try {
    const res = await fetch(`${TWILIO_API}/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok || !json.sid) {
      return { ok: false, error: `Twilio ${res.status}${json.code ? ` (${json.code})` : ""}: ${json.message ?? "send failed"}` };
    }
    return { ok: true, sid: json.sid };
  } catch (error: unknown) {
    return { ok: false, error: `Twilio unreachable: ${error instanceof Error ? error.message : String(error)}` };
  }
}
