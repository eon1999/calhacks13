// Care team roles: what each person gets and where they land after joining.
// `care_partner` is family and friends (the name predates onboarding).

export type CareRole = "care_partner" | "caregiver" | "clinician" | "patient";
export type Permission = "alerts" | "summary" | "report";

/** Roles the owner or patient can invite. */
export const INVITABLE_ROLES = ["care_partner", "caregiver", "clinician", "patient"] as const satisfies CareRole[];

export interface RoleInfo {
  title: string;
  /** One line shown in the invite picker. */
  blurb: string;
  /** What this person will be told about, shown on their first-login intro. */
  gets: string[];
  /** And what they won't be bothered with, so nobody is surprised by a 2 AM page. */
  doesNotGet: string[];
  permissions: Permission[];
  /** Whether new members of this role get urgent alerts (falls, SOS) by default. */
  urgentByDefault: boolean;
}

export const ROLES: Record<CareRole, RoleInfo> = {
  care_partner: {
    title: "Family or friend",
    blurb: "Gets alerts and a daily summary of how recovery is going.",
    gets: ["Urgent alerts: falls, SOS, and anything the band hears that sounds serious", "Missed medicine", "A daily recovery summary"],
    doesNotGet: ["Every routine check-in as it happens"],
    permissions: ["alerts", "summary"],
    urgentByDefault: true,
  },
  caregiver: {
    title: "Caregiver / home aide",
    blurb: "Sees today's schedule and gets alerts while they're helping.",
    gets: ["Today's medicine schedule and what's been taken", "Urgent alerts and missed medicine", "Check-ins that need a look"],
    doesNotGet: ["Long-term history and reports"],
    permissions: ["alerts"],
    urgentByDefault: true,
  },
  clinician: {
    title: "Doctor or nurse",
    blurb: "Gets a recovery report: medicine adherence, check-ins, and red flags.",
    gets: ["A recovery report: medicine adherence, check-in trends, falls", "Red flags marked for follow-up"],
    doesNotGet: ["Live alerts or pages; the family and caregiver handle those"],
    permissions: ["report", "summary"],
    urgentByDefault: false,
  },
  patient: {
    title: "The patient",
    blurb: "Their own view: today's medicine and who's on their care team.",
    gets: ["Today's medicine and a button to mark it taken", "Who is on their care team, and the ability to invite or remove people"],
    doesNotGet: ["Alerts about themselves"],
    permissions: ["summary"],
    urgentByDefault: false,
  },
};

export const RELATIONSHIPS = ["Daughter", "Son", "Spouse or partner", "Parent", "Sibling", "Friend", "Other"] as const;
