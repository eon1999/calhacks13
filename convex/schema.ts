import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// All timestamps are UTC milliseconds.
export default defineSchema({
  patients: defineTable({
    name: v.string(),
    timeZone: v.string(),
    tremorBaseline: v.optional(v.number()),
  }),

  careTeamMembers: defineTable({
    patientId: v.id("patients"),
    userId: v.string(),
    role: v.union(v.literal("care_partner"), v.literal("clinician")),
    permissions: v.array(
      v.union(v.literal("alerts"), v.literal("summary"), v.literal("report")),
    ),
  }).index("by_patient", ["patientId"]),

  medications: defineTable({
    patientId: v.id("patients"),
    name: v.string(),
    doseLabel: v.string(),
    times: v.array(v.string()), // "HH:mm" in the patient's time zone
    windowMinutes: v.number(),
    active: v.boolean(),
  }).index("by_patient", ["patientId"]),

  doseEvents: defineTable({
    patientId: v.id("patients"),
    medicationId: v.id("medications"),
    scheduledFor: v.number(),
    status: v.union(
      v.literal("due"),
      v.literal("opened"),
      v.literal("taken"),
      v.literal("late"),
      v.literal("missed"),
      v.literal("extra_opening"),
    ),
    openedAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
    source: v.optional(
      v.union(v.literal("pillbox"), v.literal("voice"), v.literal("manual")),
    ),
  }).index("by_patient_time", ["patientId", "scheduledFor"]),

  tremorSamples: defineTable({
    patientId: v.id("patients"),
    deviceId: v.string(),
    windowStart: v.number(),
    tremorIndex: v.number(), // 0-100
    bandRmsMg: v.number(),
    peakHz: v.number(),
    activity: v.union(v.literal("rest"), v.literal("active")),
  }).index("by_patient_time", ["patientId", "windowStart"]),

  events: defineTable({
    patientId: v.id("patients"),
    type: v.union(
      v.literal("fall"),
      v.literal("sos"),
      v.literal("lid_open"),
      v.literal("device_offline"),
    ),
    at: v.number(),
    payload: v.optional(v.any()),
    resolution: v.optional(
      v.union(v.literal("ok"), v.literal("helped"), v.literal("unresolved")),
    ),
  }).index("by_patient_time", ["patientId", "at"]),

  checkIns: defineTable({
    patientId: v.id("patients"),
    at: v.number(),
    trigger: v.union(
      v.literal("scheduled"),
      v.literal("tremor_spike"),
      v.literal("fall"),
      v.literal("manual"),
    ),
    transcript: v.string(),
    state: v.union(
      v.literal("moving_well"),
      v.literal("stiff_shaky"),
      v.literal("extra_movement"),
      v.literal("unsure"),
    ),
    notes: v.optional(v.string()),
    redFlag: v.boolean(),
  }).index("by_patient_time", ["patientId", "at"]),

  alerts: defineTable({
    patientId: v.id("patients"),
    tier: v.union(
      v.literal("info"),
      v.literal("ask"),
      v.literal("notify"),
      v.literal("urgent"),
    ),
    reason: v.string(),
    createdAt: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("acknowledged"),
      v.literal("resolved"),
    ),
    acknowledgedBy: v.optional(v.string()),
    acknowledgedAt: v.optional(v.number()),
  }).index("by_patient_status", ["patientId", "status"]),

  summaries: defineTable({
    patientId: v.id("patients"),
    kind: v.union(v.literal("daily"), v.literal("clinician")),
    periodStart: v.number(),
    periodEnd: v.number(),
    body: v.string(), // markdown
    evidenceIds: v.array(v.string()),
    model: v.string(),
    createdAt: v.number(),
  }).index("by_patient_kind", ["patientId", "kind"]),

  // Voice agent conversation memory. One sessionId per wearable conversation.
  // "event" turns are things the wearable reported (dose due, check-in timer),
  // replayed to Claude as user-side context.
  voiceTurns: defineTable({
    patientId: v.id("patients"),
    sessionId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("event")),
    text: v.string(),
    event: v.optional(v.string()), // WearableEvent, on role "event" turns
    at: v.number(),
  }).index("by_session", ["sessionId", "at"]),

  devices: defineTable({
    patientId: v.id("patients"),
    kind: v.union(v.literal("wristband"), v.literal("med_station")),
    deviceId: v.string(),
    tokenHash: v.string(),
    lastSeenAt: v.optional(v.number()),
    firmwareVersion: v.optional(v.string()),
  }).index("by_deviceId", ["deviceId"]),
});
