// Who gets a text for an alert, and what it says. Pure, so Convex
// (convex/notify.ts) and the tests share one set of rules.

import { inQuietHours, resolvePreferences, type NotificationPreferences, type StoredPreferences } from "./preferences";

export type AlertTier = "info" | "ask" | "notify" | "urgent";

export interface TextableMember {
  id: string;
  name: string;
  role: "care_partner" | "caregiver" | "clinician" | "patient";
  permissions: string[];
  phone?: string;
  isOwner?: boolean;
  /** Legacy flag; `preferences.urgent` wins once the member has chosen. */
  urgentAlerts?: boolean;
  preferences?: StoredPreferences;
}

export interface RecentText {
  to: string;
  at: number;
  status: "sent" | "failed" | "skipped";
}

export interface TextPlanEntry {
  memberId: string;
  to: string;
  /** Set when this recipient is deliberately not texted; recorded so the hub shows why. */
  skip?: string;
  /** Held for quiet hours; the next daily summary mentions it. */
  held?: boolean;
}

// "Heads-up" alerts to the same phone at most once per window; urgent always goes.
export const NOTIFY_THROTTLE_MS = 10 * 60 * 1000;
// Two SMS segments. Longer reasons are cut so a fall alert never becomes five texts.
export const MAX_TEXT_LENGTH = 300;

export const QUIET_HOURS_HELD = "Quiet hours, saved for the daily summary";
export const QUIET_HOURS_DROPPED = "Quiet hours, not texted (no daily summary to fold it into)";

const TIER_LABEL: Record<Exclude<AlertTier, "info">, string> = {
  urgent: "URGENT",
  notify: "Heads-up",
  ask: "Please check in",
};

export function preferencesOf(m: TextableMember): NotificationPreferences {
  return resolvePreferences(m.preferences, m.urgentAlerts);
}

/** Family and caregivers with alerts and a phone. Doctors get reports, and the patient isn't alerted about themself. */
function alertable(members: TextableMember[]): TextableMember[] {
  return members.filter(
    (m) => m.phone && m.permissions.includes("alerts") && m.role !== "clinician" && m.role !== "patient",
  );
}

/**
 * Members who should be texted for this tier (lib/onboarding/roles.ts), after
 * their own notification preferences (lib/notify/preferences.ts).
 * - urgent: everyone with alerts who keeps urgent alerts on
 * - notify: everyone with alerts who keeps heads-ups on
 * - ask (e.g. consent not given yet): only the person who set Cadence up
 */
export function recipientsFor(tier: AlertTier, members: TextableMember[]): TextableMember[] {
  if (tier === "info") return [];
  const want = (m: TextableMember) => {
    const prefs = preferencesOf(m);
    if (tier === "urgent") return prefs.urgent;
    if (tier === "ask") return !!m.isOwner && prefs.askAlerts;
    return prefs.headsUps;
  };
  return alertable(members).filter(want);
}

/** Whether this member gets the daily summary text: family with the summary permission, a phone, and it switched on. */
export function getsDailySummary(m: TextableMember): boolean {
  return (
    !!m.phone &&
    m.permissions.includes("summary") &&
    m.role !== "clinician" &&
    m.role !== "patient" &&
    preferencesOf(m).dailySummary
  );
}

/** Nobody would be texted for a fall or SOS. Shown as a team warning on the hub; never blocks a change. */
export function hasUrgentGap(members: TextableMember[]): boolean {
  return recipientsFor("urgent", members).length === 0;
}

/**
 * Recipients plus, for each, whether to hold the text back. One text per phone
 * number. Non-urgent texts in a member's quiet hours (in the patient's time
 * zone) are held for the daily summary; urgent always goes.
 */
export function planTexts(
  tier: AlertTier,
  members: TextableMember[],
  recent: RecentText[],
  now: number,
  timeZone = "UTC",
): TextPlanEntry[] {
  const seen = new Set<string>();
  const plan: TextPlanEntry[] = [];
  for (const m of recipientsFor(tier, members)) {
    const to = m.phone!;
    if (seen.has(to)) continue;
    seen.add(to);
    if (tier !== "urgent" && inQuietHours(preferencesOf(m).quietHours, timeZone, now)) {
      plan.push(
        getsDailySummary(m)
          ? { memberId: m.id, to, skip: QUIET_HOURS_HELD, held: true }
          : { memberId: m.id, to, skip: QUIET_HOURS_DROPPED },
      );
      continue;
    }
    const textedRecently = recent.some(
      (t) => t.to === to && t.status === "sent" && now - t.at < NOTIFY_THROTTLE_MS,
    );
    plan.push(
      tier !== "urgent" && textedRecently
        ? { memberId: m.id, to, skip: "Already texted in the last 10 minutes" }
        : { memberId: m.id, to },
    );
  }
  return plan;
}

/** "Cadence · URGENT for Margaret (3:42 PM): Said she fell in the kitchen…" */
export function alertTextBody(tier: AlertTier, patientName: string, localTime: string, reason: string): string {
  const label = tier === "info" ? "Update" : TIER_LABEL[tier];
  const head = `Cadence · ${label} for ${patientName} (${localTime}): `;
  const tail = " Reply STOP to opt out.";
  const room = MAX_TEXT_LENGTH - head.length - tail.length;
  const clean = reason.replace(/\s+/g, " ").trim();
  const body = clean.length > room ? `${clean.slice(0, room - 1).trimEnd()}…` : clean;
  return `${head}${body}${tail}`;
}
