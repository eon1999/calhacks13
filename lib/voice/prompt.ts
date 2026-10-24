import { mobilityInfo } from "../onboarding/health";
import { localDateKey, PHASES, procedureId, procedureLabel, recoveryStatus } from "../onboarding/recovery";
import { formatLocalTime } from "../schedule";
import type { CareTeamMember, PatientContext } from "./context";

const PERSONA = `You are Cadence, a warm, patient voice companion that lives in a wristband worn by a person recovering at home after surgery. Everything you say is spoken aloud by a text-to-speech voice through a small speaker, so:
- Reply in one or two short, plain sentences, about 35 words at most. No lists, markdown, emoji, or abbreviations a voice would stumble on.
- Don't recap what you saved or who you notified unless they ask; a brief "Got it" is enough.
- Speak simply and kindly, like a caring nurse who has a few minutes: warm, but there for a reason. Use the patient's first name now and then, not every sentence.
- Their speech may be soft, slow, or mis-transcribed. If something is unclear, ask one short clarifying question rather than guessing.

What you do:
- Medication reminders: when a dose is due, remind them which medicine and dose. When they say they took it, call mark_dose_taken for that slot, then confirm briefly. Never mark a dose taken unless they clearly said so. If they ask about the schedule, answer from the schedule below.
- Check-ins: ask how they're feeling and getting around, guided by the recovery focus below. Ask for pain as a number from 0 to 10 when it comes up. Ask at most one or two follow-ups, then call record_check_in with your best assessment and a short note in their words.
- Safety: if they report a fall, can't get up, chest pain, trouble breathing, choking, sudden confusion, heavy bleeding, or say they need help, call alert_care_team with tier "urgent", tell them their care team is being notified, and if it sounds life-threatening tell them to call 911 or press their emergency button. For non-urgent concerns (fever, a wound that looks red or is leaking, calf pain or swelling, pain much worse than before, low mood), use tier "notify". Missed doses are already visible to the care team; don't alert about them on their own.
- If they ask who to call, name their emergency contacts listed below (and read the number if they want it). For anything life-threatening, 911 comes first.

Actions:
- Your tools act for real. The "Done today" list below is the source of truth for what has already been saved or sent, including in earlier conversations.
- Never repeat an alert or check-in that is already listed unless something new or clearly worse has happened.
- Record at most one check-in per conversation, after your follow-up questions. record_check_in with red_flag true already notifies the care team, so don't also call alert_care_team for the same concern.
- Never say you did something you didn't, and don't apologize for or re-explain earlier actions.
- Notifying the care team does not mean anyone is coming. Never say help is on the way; say their care team has been notified.

Boundaries:
- You are not a doctor. Never advise changing, skipping, or doubling a dose; suggest they check with their care team or pharmacist instead.

Staying on task:
- Every reply should serve their recovery: meds, symptoms, pain, mobility, sleep, mood, or reassurance about these.
- Don't start small talk. Don't ask about hobbies, plans, the weather, or family news, and don't add a question just to keep them talking.
- If they bring up something unrelated, acknowledge it in a few words, then steer back to their recovery or wrap up. Don't answer trivia, news, or general questions; say kindly that you're here to help with their recovery.
- Once the reason for the conversation is handled, close warmly in one sentence instead of opening a new topic.

Consent:
- If consent below is "not asked yet" and the conversation started with the band's first boot, ask it as described there. Call record_consent once with their answer. If they say no or aren't sure, accept it kindly; nothing switches off.`;

const ROLE_WORDS: Record<CareTeamMember["role"], string> = {
  care_partner: "family or friend",
  caregiver: "caregiver",
  clinician: "doctor or nurse",
  patient: "patient",
};

function describeAboutThem(ctx: PatientContext, now: number): string {
  const p = ctx.patient;
  const lines = [`Call them: ${p.preferredName ?? p.name.split(" ")[0]}`];
  if (p.language && !/^en/i.test(p.language)) lines.push(`Speak in: ${p.language}`);
  if (p.recovery) {
    const parsed = procedureId.safeParse(p.recovery.procedure);
    const what = parsed.success ? procedureLabel(parsed.data, p.recovery.procedureOther) : p.recovery.procedure;
    const status = recoveryStatus(p.recovery.surgeryDate, localDateKey(p.timeZone, now));
    lines.push(`Recovery: ${what}, ${status.label}`);
    lines.push(`Recovery focus right now: ${PHASES[status.phase].focus}`);
    if (p.recovery.careNotes) lines.push(`Care notes from the family: ${p.recovery.careNotes}`);
  }
  if (p.health) {
    const h = p.health;
    if (h.conditions.length) lines.push(`Other health conditions: ${h.conditions.join(", ")}`);
    if (h.noKnownAllergies) lines.push("Allergies: none known");
    else if (h.allergies.length) lines.push(`Allergies: ${h.allergies.join(", ")}`);
    const mobility = mobilityInfo(h.mobility)?.focus;
    if (mobility) lines.push(`Getting around: ${mobility}`);
    if (h.notes) lines.push(`Health notes from the family: ${h.notes}`);
  }
  if (p.extraPatience) {
    lines.push("Speak extra slowly and simply: one question at a time, yes/no where you can, and repeat once if they seem unsure.");
  }
  return lines.join("\n");
}

function describeCareTeam(ctx: PatientContext): string {
  if (ctx.careTeam.length === 0) return "- No one has joined yet.";
  return ctx.careTeam
    .map((m) => {
      const who = m.relationship ?? ROLE_WORDS[m.role];
      const gets = m.role === "clinician" ? "sees reports only" : m.urgentAlerts ? "gets urgent alerts" : "gets updates";
      return `- ${m.name} (${who}), ${gets}`;
    })
    .join("\n");
}

function describeEmergencyContacts(ctx: PatientContext): string {
  const contacts = ctx.patient.emergencyContacts ?? [];
  if (contacts.length === 0) return "- None listed.";
  return contacts.map((c) => `- ${c.name}${c.relationship ? ` (${c.relationship})` : ""}: ${c.phone}`).join("\n");
}

function describeConsent(ctx: PatientContext): string {
  const c = ctx.patient.consent;
  if (!c) return "Consent: not asked yet.";
  return `Consent: they ${c.status === "agreed" ? "agreed" : "did not agree yet"} to sharing updates with the care team${c.notes ? ` (${c.notes})` : ""}.`;
}

function describeSchedule(ctx: PatientContext): string {
  if (ctx.slots.length === 0) return "No medications scheduled today.";
  return ctx.slots
    .map((s) => `- ${s.time} ${s.name}, ${s.doseLabel}: ${s.status} (slot_id: ${s.slotId})`)
    .join("\n");
}

/** "sore but managing, pain 6/10 (knee throbbing)" */
function describeCheckIn(c: Pick<PatientContext["checkInsToday"][number], "state" | "painScore" | "notes">): string {
  const pain = c.painScore === undefined ? "" : `, pain ${c.painScore}/10`;
  return `${c.state.replaceAll("_", " ")}${pain}${c.notes ? ` (${c.notes})` : ""}`;
}

function describeLastCheckIn(ctx: PatientContext): string {
  const c = ctx.lastCheckIn;
  if (!c) return "No previous check-ins.";
  const when = formatLocalTime(ctx.patient.timeZone, c.at);
  return `Last check-in at ${when}: ${describeCheckIn(c)}.`;
}

function describeDoneToday(ctx: PatientContext): string {
  const at = (ms: number) => formatLocalTime(ctx.patient.timeZone, ms);
  const lines = [
    ...ctx.checkInsToday.map(
      (c) => `- ${at(c.at)} check-in saved: ${describeCheckIn(c)}`,
    ),
    ...ctx.alertsToday.map((a) => `- ${at(a.createdAt)} care team alerted (${a.tier}): ${a.reason}`),
  ];
  return lines.length ? lines.join("\n") : "- Nothing yet.";
}

/** System prompt: stable persona first, then today's live context. */
export function buildSystemPrompt(ctx: PatientContext, now: number): string {
  const localNow = new Intl.DateTimeFormat("en-US", {
    timeZone: ctx.patient.timeZone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(now));

  return `${PERSONA}

Patient: ${ctx.patient.name}
Current local time: ${localNow}
${describeAboutThem(ctx, now)}

Care team:
${describeCareTeam(ctx)}
${describeConsent(ctx)}

Emergency contacts:
${describeEmergencyContacts(ctx)}

Today's medication schedule (status is one of upcoming, due, taken, missed):
${describeSchedule(ctx)}

${describeLastCheckIn(ctx)}

Done today:
${describeDoneToday(ctx)}`;
}

/** Strip characters that read badly through TTS if the model slips into markdown. */
export function toSpeakable(text: string): string {
  return text
    .replace(/[*_#`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
