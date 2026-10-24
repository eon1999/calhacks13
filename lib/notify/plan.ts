// Who gets a text for an alert, and what it says. Pure, so Convex
// (convex/notify.ts) and the tests share one set of rules.

export type AlertTier = "info" | "ask" | "notify" | "urgent";

export interface TextableMember {
  id: string;
  name: string;
  role: "care_partner" | "caregiver" | "clinician" | "patient";
  permissions: string[];
  phone?: string;
  isOwner?: boolean;
  urgentAlerts?: boolean;
}

export interface RecentText {
  to: string;
  at: number;
  status: "sent" | "failed" | "skipped";
}

export interface TextPlanEntry {
  /** Unset when the text goes to the simulator's test number rather than a team member. */
  memberId?: string;
  to: string;
  /** Set when this recipient is deliberately not texted; recorded so the hub shows why. */
  skip?: string;
}

// "Heads-up" alerts to the same phone at most once per window; urgent always goes.
export const NOTIFY_THROTTLE_MS = 10 * 60 * 1000;
// Two SMS segments. Longer reasons are cut so a fall alert never becomes five texts.
export const MAX_TEXT_LENGTH = 300;

const TIER_LABEL: Record<Exclude<AlertTier, "info">, string> = {
  urgent: "URGENT",
  notify: "Heads-up",
  ask: "Please check in",
};

/**
 * Members who should be texted for this tier. Doctors get reports, not pages,
 * and the patient isn't alerted about themself (lib/onboarding/roles.ts).
 * - urgent: everyone with alerts who keeps urgent alerts on
 * - notify: everyone with alerts
 * - ask (e.g. consent not given yet): only the person who set Cadence up
 */
export function recipientsFor(tier: AlertTier, members: TextableMember[]): TextableMember[] {
  if (tier === "info") return [];
  const alertable = members.filter(
    (m) => m.phone && m.permissions.includes("alerts") && m.role !== "clinician" && m.role !== "patient",
  );
  if (tier === "urgent") return alertable.filter((m) => m.urgentAlerts ?? false);
  if (tier === "ask") return alertable.filter((m) => m.isOwner);
  return alertable;
}

/**
 * Recipients plus, for each, whether to hold the text back. One text per phone number.
 * With a `testTo` number (the simulator's debug mode), every alert texts only that
 * number, unthrottled, so testers see each trigger land without paging the real team.
 */
export function planTexts(
  tier: AlertTier,
  members: TextableMember[],
  recent: RecentText[],
  now: number,
  testTo?: string,
): TextPlanEntry[] {
  if (tier === "info") return [];
  if (testTo) return [{ to: testTo }];
  const seen = new Set<string>();
  const plan: TextPlanEntry[] = [];
  for (const m of recipientsFor(tier, members)) {
    const to = m.phone!;
    if (seen.has(to)) continue;
    seen.add(to);
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
