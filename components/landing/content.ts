import type { ShapeName } from "@/lib/landing/particles";

/** One line of a display headline: optional ↪ indent, italic lead-in, uppercase text. */
export interface HeadlineLine {
  arrow?: boolean;
  em?: string;
  text?: string;
  emAfter?: string;
}

export interface StoryBeat {
  id: string;
  shape: ShapeName;
  tag: string;
  lines: HeadlineLine[];
  sub: string;
}

export const HERO = {
  shape: "torus" as ShapeName,
  kicker: "A voice wristband for people living with Parkinson's",
  lines: [
    { em: "Care", text: "that" },
    { text: "keeps time" },
    { arrow: true, text: "with you" },
  ] satisfies HeadlineLine[],
};

export const STORY: StoryBeat[] = [
  {
    id: "reminds",
    shape: "capsule",
    tag: "Reminds",
    lines: [{ em: "It", text: "reminds you" }, { arrow: true, text: "before it's" }, { text: "too late" }],
    sub: "Every dose, on time and out loud. Gentle, never nagging, and it knows a missed dose from a late one.",
  },
  {
    id: "listens",
    shape: "wave",
    tag: "Listens",
    lines: [{ text: "Listens" }, { arrow: true, em: "in", text: "plain words" }],
    sub: "Tap the band and talk. It checks in on how you're moving, sleeping and feeling, and remembers so you don't have to.",
  },
  {
    id: "cares",
    shape: "heart",
    tag: "Cares",
    lines: [{ text: "Speaks up", emAfter: "when" }, { arrow: true, text: "it matters" }],
    sub: "Falls, missed doses and red flags reach your care team in seconds, with the context they need to help.",
  },
  {
    id: "people",
    shape: "sphere",
    tag: "Our people",
    lines: [{ em: "We" }, { text: "build for" }, { text: "steady days," }, { text: "not perfect ones" }],
    sub: "Designed with the people who live it, the people who care for them, and the clinicians who treat them.",
  },
];

export const FEATURES = [
  "Spoken dose reminders",
  "Tap-to-talk check-ins",
  "On / off symptom tracking",
  "Fall follow-up",
  "Care-team alerts",
  "Clinician timeline",
  "Adherence reports",
  "Caregiver companion",
  "Daily rhythm summaries",
];

export interface Surface {
  href: string;
  title: string;
  tags: string[];
  hue: [string, string];
  glyph: string;
}

export const SURFACES: Surface[] = [
  { href: "/hub", title: "Wearable simulator", tags: ["Voice", "Live"], hue: ["#9047ff", "#ffb4e6"], glyph: "◯" },
  { href: "/care", title: "Care dashboard", tags: ["Caregivers", "Alerts"], hue: ["#4a1aa8", "#7fd3ff"], glyph: "♡" },
  { href: "/demo", title: "Demo controls", tags: ["Seed", "Events"], hue: ["#2a1647", "#c79bff"], glyph: "◐" },
  { href: "/settings", title: "Settings", tags: ["Schedule", "Voice"], hue: ["#6b2fe0", "#f5efff"], glyph: "⌁" },
];

export interface DayMoment {
  time: string;
  label: string;
  kind: string;
}

export const DAY: { part: string; moments: DayMoment[] }[] = [
  {
    part: "Morning",
    moments: [
      { time: "07:30", label: "Good-morning check-in", kind: "Voice" },
      { time: "08:00", label: "Levodopa reminder, spoken", kind: "Dose" },
      { time: "08:04", label: "“Taken” — logged by voice", kind: "Log" },
    ],
  },
  {
    part: "Afternoon",
    moments: [
      { time: "12:00", label: "Second dose, with lunch", kind: "Dose" },
      { time: "15:20", label: "Stiffness noted as an “off” period", kind: "Symptom" },
    ],
  },
  {
    part: "Evening",
    moments: [
      { time: "18:45", label: "Fall detected — follow-up and alert", kind: "Care team" },
      { time: "21:30", label: "Day summary sent to your clinician", kind: "Report" },
    ],
  },
];

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/hub", label: "Simulator" },
  { href: "/care", label: "Care" },
  { href: "/demo", label: "Demo" },
  { href: "/settings", label: "Settings" },
];
