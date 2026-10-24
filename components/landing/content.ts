import type { ShapeName } from "@/lib/landing/particles";

/** One line of a display headline: italic lead-in, uppercase text, optional italic tail. */
export interface HeadlineLine {
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
  shape: "ecg" as ShapeName,
  kicker: "A voice wristband for recovering at home after surgery",
  lines: [
    { em: "Care", text: "that" },
    { text: "keeps time" },
    { text: "with you" },
  ] satisfies HeadlineLine[],
};

export const STORY: StoryBeat[] = [
  {
    id: "reminds",
    shape: "capsule",
    tag: "Reminds",
    lines: [{ em: "It", text: "reminds you" }, { text: "before it's" }, { text: "too late" }],
    sub: "Pain relief, antibiotics, blood thinners: every dose on time and out loud. Gentle, never nagging, and it knows a missed dose from a late one.",
  },
  {
    id: "listens",
    shape: "wave",
    tag: "Listens",
    lines: [{ text: "Listens" }, { em: "in", text: "plain words" }],
    sub: "Tap the band and talk. It asks about pain, the wound, sleep and getting around, and remembers so you don't have to.",
  },
  {
    id: "cares",
    shape: "heart",
    tag: "Cares",
    lines: [{ text: "Speaks up", emAfter: "when" }, { text: "it matters" }],
    sub: "Falls, fevers, a wound that looks wrong, missed doses: red flags reach your care team in seconds, with the context they need to help.",
  },
  {
    id: "people",
    shape: "sphere",
    tag: "Our people",
    lines: [{ em: "We" }, { text: "build for" }, { text: "steady days," }, { text: "not perfect ones" }],
    sub: "Designed with people home from surgery, the families and aides who help them, and the clinicians who follow their recovery.",
  },
];

export const FEATURES = [
  "Spoken dose reminders",
  "Tap-to-talk check-ins",
  "Pain and wound check-ins",
  "Fall follow-up",
  "Care-team alerts",
  "Recovery timeline",
  "Adherence reports",
  "Caregiver companion",
  "Move-more nudges",
  "Daily recovery summaries",
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
  { href: "/demo", title: "Try the demo", tags: ["Setup", "Texts"], hue: ["#2a1647", "#c79bff"], glyph: "◐" },
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
      { time: "08:00", label: "Pain relief and blood thinner, spoken", kind: "Dose" },
      { time: "08:04", label: "“Taken” — logged by voice", kind: "Log" },
    ],
  },
  {
    part: "Afternoon",
    moments: [
      { time: "13:10", label: "Quiet for three hours: a nudge to take a short walk", kind: "Movement" },
      { time: "14:00", label: "Pain 4/10, wound looks fine", kind: "Check-in" },
    ],
  },
  {
    part: "Evening",
    moments: [
      { time: "18:45", label: "“Feeling hot and shivery”: fever flagged to the family", kind: "Care team" },
      { time: "21:30", label: "Day 3 summary ready for the surgical team", kind: "Report" },
    ],
  },
];

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/start", label: "Get started" },
  { href: "/hub", label: "Simulator" },
  { href: "/care", label: "Care" },
  { href: "/demo", label: "Demo" },
  { href: "/settings", label: "Settings" },
];
