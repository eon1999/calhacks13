import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { raiseAlert, resolveAlerts } from "./alerts";
import {
  engineSlots,
  extraOpeningReason,
  isLowActivity,
  LOW_ACTIVITY_SPAN_MS,
  matchLidOpen,
  missedReason,
  planTick,
  reminderReason,
  type EngineSlot,
  type LidOpenMatch,
} from "../lib/dose-engine";
import { localDateKey, PHASES, recoveryStatus } from "../lib/onboarding/recovery";
import { formatClock } from "../lib/notify/preferences";
import { localDayBounds } from "../lib/schedule";
import { dueScheduledCheckIn } from "../lib/voice/events";

// The dose engine. `tick` runs every minute (convex/crons.ts): it opens dose
// rows, schedules reminders at T and T+15 (spoken by the hub/band), marks
// misses and tells the care team. Lid openings come in through `lidOpened`.

const DAY_MS = 86_400_000;
const MINUTE = 60_000;
export const DEVICE_OFFLINE_MS = 15 * MINUTE;

export function firstName(patient: Doc<"patients">): string {
  return patient.preferredName ?? patient.name.split(" ")[0];
}

export function localHour(timeZone: string, at: number): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date(at));
  return Number(hour) % 24;
}

/** The engine's view of a patient: yesterday's and today's slots with their dose rows. */
export async function loadSlots(ctx: QueryCtx, patient: Doc<"patients">, now: number): Promise<EngineSlot[]> {
  const meds = await ctx.db
    .query("medications")
    .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
    .filter((q) => q.eq(q.field("active"), true))
    .collect();
  const { start, end } = localDayBounds(patient.timeZone, now);
  const doses = await ctx.db
    .query("doseEvents")
    .withIndex("by_patient_time", (q) =>
      q
        .eq("patientId", patient._id)
        .gte("scheduledFor", start - DAY_MS - MINUTE)
        .lt("scheduledFor", end + MINUTE),
    )
    .collect();
  return engineSlots(
    meds.map((m) => ({
      id: m._id,
      name: m.name,
      doseLabel: m.doseLabel,
      times: m.times,
      windowMinutes: m.windowMinutes,
      createdAt: m._creationTime,
    })),
    doses.map((d) => ({
      id: d._id,
      medicationId: d.medicationId,
      scheduledFor: d.scheduledFor,
      status: d.status,
      openedAt: d.openedAt,
      confirmedAt: d.confirmedAt,
      remindersSent: d.remindersSent,
    })),
    patient.timeZone,
    now,
  );
}

async function ensureDose(
  ctx: MutationCtx,
  patientId: Id<"patients">,
  slot: EngineSlot,
  status: Doc<"doseEvents">["status"] = "due",
): Promise<Id<"doseEvents">> {
  if (slot.dose) return slot.dose.id as Id<"doseEvents">;
  const id = await ctx.db.insert("doseEvents", {
    patientId,
    medicationId: slot.medicationId as Id<"medications">,
    scheduledFor: slot.scheduledFor,
    status,
    remindersSent: 0,
  });
  slot.dose = { id, medicationId: slot.medicationId, scheduledFor: slot.scheduledFor, status, remindersSent: 0 };
  return id;
}

/** One engine pass for one patient. Returns what it did, for tests and the demo panel. */
export async function tickPatient(ctx: MutationCtx, patient: Doc<"patients">, now: number) {
  const slots = await loadSlots(ctx, patient, now);
  const plan = planTick(slots, now);
  const name = firstName(patient);

  for (const slot of plan.create) await ensureDose(ctx, patient._id, slot);

  for (const group of plan.reminders) {
    for (const slot of group.slots) {
      await ctx.db.patch(slot.dose!.id as Id<"doseEvents">, { remindersSent: group.n, lastRemindedAt: now });
    }
    const refId = String(group.scheduledFor);
    // The second reminder replaces the first, so the hub only speaks the latest.
    await resolveAlerts(ctx, patient._id, ["dose_reminder"], { refId });
    await raiseAlert(ctx, {
      patientId: patient._id,
      tier: "ask",
      kind: "dose_reminder",
      reason: reminderReason(name, group, group.n, patient.timeZone),
      refId,
      at: now,
    });
  }

  for (const slot of plan.missed) {
    await ctx.db.patch(slot.dose!.id as Id<"doseEvents">, { status: "missed" });
  }
  for (const group of plan.missedAlerts) {
    const refId = String(group.scheduledFor);
    await resolveAlerts(ctx, patient._id, ["dose_reminder"], { refId });
    await raiseAlert(ctx, {
      patientId: patient._id,
      tier: "notify",
      kind: "missed_dose",
      reason: missedReason(name, group, patient.timeZone),
      refId,
      at: now,
    });
  }

  const lowActivity = await checkLowActivity(ctx, patient, now);
  const scheduledCheckIn = await checkScheduledCheckIn(ctx, patient, now);

  return {
    created: plan.create.length,
    reminders: plan.reminders.length,
    missed: plan.missed.length,
    missedAlerts: plan.missedAlerts.length,
    lowActivity,
    scheduledCheckIn,
  };
}

async function checkLowActivity(ctx: MutationCtx, patient: Doc<"patients">, now: number): Promise<boolean> {
  const samples = await ctx.db
    .query("activitySamples")
    .withIndex("by_patient_time", (q) =>
      q.eq("patientId", patient._id).gte("windowStart", now - LOW_ACTIVITY_SPAN_MS - 10 * MINUTE),
    )
    .collect();
  if (!isLowActivity(samples, now, localHour(patient.timeZone, now))) return false;

  // One nudge per still stretch.
  const recent = await ctx.db
    .query("alerts")
    .withIndex("by_patient_created", (q) => q.eq("patientId", patient._id).gte("createdAt", now - LOW_ACTIVITY_SPAN_MS))
    .collect();
  if (recent.some((a) => a.kind === "low_activity")) return false;
  await raiseAlert(ctx, {
    patientId: patient._id,
    tier: "ask",
    kind: "low_activity",
    reason: `${firstName(patient)} has barely moved in 3 hours. Cadence will suggest a short walk if their care plan allows.`,
    at: now,
  });
  return true;
}

/**
 * Phase-based scheduled check-ins (3×/day in the first days home, easing to
 * every other day): raise an "ask" prompt for the hub/band to speak, once per
 * slot, never while a dose reminder or another prompt is waiting.
 */
async function checkScheduledCheckIn(ctx: MutationCtx, patient: Doc<"patients">, now: number): Promise<boolean> {
  if (!patient.recovery) return false;
  const { start } = localDayBounds(patient.timeZone, now);
  const [meds, checkIns, alerts] = await Promise.all([
    ctx.db
      .query("medications")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .filter((q) => q.eq(q.field("active"), true))
      .collect(),
    ctx.db
      .query("checkIns")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patient._id).gte("at", start))
      .collect(),
    ctx.db
      .query("alerts")
      .withIndex("by_patient_created", (q) => q.eq("patientId", patient._id).gte("createdAt", start))
      .collect(),
  ]);
  const status = recoveryStatus(patient.recovery.surgeryDate, localDateKey(patient.timeZone, now));
  const due = dueScheduledCheckIn({
    recovery: status,
    doses: meds.flatMap((m) => m.times.map((time) => ({ time, windowMinutes: m.windowMinutes }))),
    checkInTimes: checkIns.map((c) => c.at),
    timeZone: patient.timeZone,
    now,
  });
  if (!due) return false;
  if (alerts.some((a) => a.kind === "check_in" && a.refId === due.key)) return false;
  // Don't talk over a dose reminder, a fall check or a move nudge that's still waiting.
  if (alerts.some((a) => a.status === "open" && a.tier === "ask" && a.kind && !a.deliveredAt)) return false;
  await raiseAlert(ctx, {
    patientId: patient._id,
    tier: "ask",
    kind: "check_in",
    reason: `Time for ${firstName(patient)}'s ${formatClock(due.time)} check-in (${PHASES[status.phase].label.toLowerCase()}).`,
    refId: due.key,
    at: now,
  });
  return true;
}

/** Devices silent for 15 minutes raise one "device offline" alert; it clears when they're back. */
export async function checkDevices(ctx: MutationCtx, now: number): Promise<number> {
  const devices = await ctx.db.query("devices").collect();
  let raised = 0;
  for (const device of devices) {
    // Only devices that have really reported over HTTP (touchDevice sets firmwareVersion);
    // a band paired from the browser simulator never heartbeats.
    if (!device.firmwareVersion || !device.lastSeenAt || now - device.lastSeenAt < DEVICE_OFFLINE_MS) continue;
    const open = await ctx.db
      .query("alerts")
      .withIndex("by_patient_status", (q) => q.eq("patientId", device.patientId).eq("status", "open"))
      .collect();
    if (open.some((a) => a.kind === "device_offline" && a.refId === device.deviceId)) continue;
    const label = device.kind === "wristband" ? "wristband" : "pillbox";
    await ctx.db.insert("events", {
      patientId: device.patientId,
      type: "device_offline",
      at: now,
      payload: { deviceId: device.deviceId, lastSeenAt: device.lastSeenAt },
    });
    await raiseAlert(ctx, {
      patientId: device.patientId,
      tier: "notify",
      kind: "device_offline",
      reason: `The ${label} (${device.deviceId}) hasn't checked in for ${Math.round((now - device.lastSeenAt) / MINUTE)} minutes. Reminders and fall alerts may not reach you. Check it's charged and on Wi-Fi.`,
      refId: device.deviceId,
      at: now,
    });
    raised++;
  }
  return raised;
}

export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const patients = await ctx.db.query("patients").collect();
    for (const patient of patients) await tickPatient(ctx, patient, now);
    await checkDevices(ctx, now);
  },
});

/**
 * The pillbox lid opened. Matches it to the dose it's for ("opened", or "late"
 * past the window), or flags an extra opening within 2 h of a taken dose. Never
 * blocks; the hub asks "did you take them?" or gently warns.
 */
export async function lidOpened(
  ctx: MutationCtx,
  patientId: Id<"patients">,
  opts: { now?: number; deviceId?: string } = {},
): Promise<LidOpenMatch["kind"]> {
  const patient = await ctx.db.get(patientId);
  if (!patient) throw new Error("Patient not found");
  const now = opts.now ?? Date.now();
  const slots = await loadSlots(ctx, patient, now);
  const match = matchLidOpen(slots, now);
  const name = firstName(patient);

  await ctx.db.insert("events", {
    patientId,
    type: "lid_open",
    at: now,
    payload: { deviceId: opts.deviceId, match: match.kind },
  });

  if (match.kind === "dose") {
    for (const slot of match.slots) {
      const id = await ensureDose(ctx, patientId, slot);
      await ctx.db.patch(id, { status: match.late ? "late" : "opened", openedAt: now, source: "pillbox" });
    }
    const refId = String(match.scheduledFor);
    await resolveAlerts(ctx, patientId, ["dose_reminder"], { refId });
    if (match.late) await resolveAlerts(ctx, patientId, ["missed_dose"], { refId, by: "Cadence: opened late" });
    await raiseAlert(ctx, {
      patientId,
      tier: "ask",
      kind: "dose_confirm",
      reason: `Pillbox opened${match.late ? " (late)" : ""}. Asking ${name} whether they took it.`,
      refId,
      at: now,
    });
  } else if (match.kind === "extra") {
    const slot = match.slots[0];
    await ctx.db.insert("doseEvents", {
      patientId,
      medicationId: slot.medicationId as Id<"medications">,
      scheduledFor: now,
      status: "extra_opening",
      openedAt: now,
      source: "pillbox",
    });
    await raiseAlert(ctx, {
      patientId,
      tier: "ask",
      kind: "extra_opening_prompt",
      reason: `Pillbox opened again; ${name} already took this dose.`,
      at: now,
    });
    await raiseAlert(ctx, {
      patientId,
      tier: "notify",
      kind: "extra_opening",
      reason: extraOpeningReason(name, match.lastTakenAt, now, patient.timeZone),
      at: now,
    });
  }
  return match.kind;
}

/** Closes reminder prompts and missed-dose alerts once a dose is confirmed taken. */
export async function doseConfirmed(ctx: MutationCtx, patientId: Id<"patients">, scheduledFor: number) {
  const refId = String(scheduledFor);
  await resolveAlerts(ctx, patientId, ["dose_reminder", "dose_confirm"], { refId });
  await resolveAlerts(ctx, patientId, ["missed_dose"], { refId, by: "Cadence: taken later, confirmed by voice" });
}
