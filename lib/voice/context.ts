import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { buildDaySchedule, type DoseSlot } from "../schedule";
import { convex } from "./convex";

export interface PatientContext {
  patient: Doc<"patients">;
  slots: DoseSlot[];
  lastCheckIn: Doc<"checkIns"> | null;
  checkInsToday: Doc<"checkIns">[];
  alertsToday: Doc<"alerts">[];
  careTeam: CareTeamMember[];
}

export interface CareTeamMember {
  name: string;
  role: Doc<"careTeamMembers">["role"];
  relationship?: string;
  urgentAlerts: boolean;
}

export async function loadPatientContext(
  patientId: Id<"patients">,
  now: number,
): Promise<PatientContext | null> {
  const ctx = await convex().query(api.voice.getContext, { patientId, now });
  if (!ctx) return null;

  const slots = buildDaySchedule(
    ctx.medications.map((m) => ({
      id: m._id,
      name: m.name,
      doseLabel: m.doseLabel,
      times: m.times,
      windowMinutes: m.windowMinutes,
    })),
    ctx.doseEvents.map((e) => ({
      medicationId: e.medicationId,
      scheduledFor: e.scheduledFor,
      status: e.status,
    })),
    ctx.patient.timeZone,
    now,
  );

  return {
    patient: ctx.patient,
    slots,
    lastCheckIn: ctx.lastCheckIn,
    checkInsToday: ctx.checkInsToday,
    alertsToday: ctx.alertsToday,
    careTeam: ctx.careTeam,
  };
}
