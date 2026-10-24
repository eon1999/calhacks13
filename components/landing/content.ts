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
  kicker: "Peace of mind for families looking after someone at home",
  lines: [
    { em: "Be there", text: "even" },
    { text: "when you" },
    { text: "can't be" },
  ] satisfies HeadlineLine[],
};

export const STORY: StoryBeat[] = [
  {
    id: "watches",
    shape: "heart",
    tag: "Keeps watch",
    lines: [{ em: "Know", text: "how they're" }, { text: "really doing" }],
    sub: "Doses, heart rate, temperature, movement and how they say they feel, in one live picture the whole family shares, wherever you are.",
  },
  {
    id: "alerts",
    shape: "wave",
    tag: "Speaks up",
    lines: [{ text: "Tells you", emAfter: "when" }, { text: "it matters" }],
    sub: "A fall, a fever, a missed dose, a check-in that sounds off: the right person gets a text in seconds. Everything else waits for the evening summary, so you're never buried in pings.",
  },
  {
    id: "reminds",
    shape: "capsule",
    tag: "Looks after them",
    lines: [{ em: "So", text: "you don't" }, { text: "have to call" }, { text: "and ask" }],
    sub: "Every dose on time and out loud, and a friendly check-in on pain, sleep and getting around. No more “did you take your pills?” calls.",
  },
  {
    id: "people",
    shape: "sphere",
    tag: "Our people",
    lines: [{ em: "We" }, { text: "build for" }, { text: "the whole" }, { text: "family" }],
    sub: "For parents and partners home from surgery, the sons, daughters and aides who look after them, and the clinicians who follow their recovery.",
  },
];

export const FEATURES = [
  "Live family dashboard",
  "Fall alerts to family",
  "Text alerts, with quiet hours",
  "Daily summary texts",
  "Missed-dose alerts",
  "Heart rate and temperature watch",
  "Emergency contacts",
  "Spoken dose reminders",
  "Tap-to-talk check-ins",
  "Clinician reports",
];

export interface Surface {
  href: string;
  title: string;
  tags: string[];
  hue: [string, string];
  glyph: string;
}

export const SURFACES: Surface[] = [
  { href: "/care", title: "Family dashboard", tags: ["Family", "Alerts"], hue: ["#4a1aa8", "#7fd3ff"], glyph: "♡" },
  { href: "/hub", title: "Their wristband", tags: ["Voice", "Live"], hue: ["#9047ff", "#ffb4e6"], glyph: "◯" },
  { href: "/settings", title: "Who gets told", tags: ["Texts", "Quiet hours"], hue: ["#6b2fe0", "#f5efff"], glyph: "⌁" },
  { href: "/try", title: "Try the demo", tags: ["Setup", "Texts"], hue: ["#2a1647", "#c79bff"], glyph: "◐" },
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
      { time: "07:30", label: "Mom's good-morning check-in: slept well", kind: "Voice" },
      { time: "08:00", label: "Pain relief and blood thinner, spoken", kind: "Dose" },
      { time: "08:04", label: "“Taken”: you see it on your phone", kind: "Family" },
    ],
  },
  {
    part: "Afternoon",
    moments: [
      { time: "13:10", label: "Quiet for three hours: a nudge to walk, no call needed", kind: "Movement" },
      { time: "14:00", label: "Pain 4/10, wound looks fine", kind: "Check-in" },
    ],
  },
  {
    part: "Evening",
    moments: [
      { time: "18:45", label: "“Feeling hot and shivery”: you get a text", kind: "Alert" },
      { time: "20:00", label: "Summary text: 6/6 doses, pain 5→3", kind: "Family" },
    ],
  },
];

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/start", label: "Get started" },
  { href: "/hub", label: "Simulator" },
  { href: "/care", label: "Family" },
  { href: "/demo", label: "Demo" },
  { href: "/settings", label: "Settings" },
];
