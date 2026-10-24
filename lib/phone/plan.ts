import { toE164 } from "../notify/phone";

// Who the phone agent calls for an urgent alert. Emergency contacts first
// (patients.emergencyContacts, from /hub onboarding); if there are none, the
// care team members who get urgent alerts and have a phone. Pure, so it's tested.

export const MAX_URGENT_CALLS = 3;

export interface CallTarget {
  name: string;
  to: string; // E.164
  memberId?: string;
}

interface Contact {
  name: string;
  phone: string;
}

interface Member {
  id: string;
  name?: string;
  role: string;
  phone?: string;
  urgentAlerts?: boolean;
}

export function planUrgentCalls(emergencyContacts: Contact[], members: Member[]): CallTarget[] {
  const fromContacts = emergencyContacts.map((c) => ({ name: c.name, to: toE164(c.phone) }));
  const fromTeam = members
    .filter((m) => m.role !== "clinician" && m.role !== "patient" && m.urgentAlerts !== false && m.phone)
    .map((m) => ({ name: m.name ?? "there", to: toE164(m.phone ?? ""), memberId: m.id }));

  const pool = fromContacts.some((c) => c.to) ? fromContacts : fromTeam;
  const seen = new Set<string>();
  const targets: CallTarget[] = [];
  for (const t of pool) {
    if (!t.to || seen.has(t.to)) continue;
    seen.add(t.to);
    targets.push({ ...t, to: t.to });
    if (targets.length === MAX_URGENT_CALLS) break;
  }
  return targets;
}
