import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const careRole = v.union(
  v.literal("care_partner"), // family and friends
  v.literal("caregiver"), // paid caregiver / home aide
  v.literal("clinician"),
  v.literal("patient"),
);

// All timestamps are UTC milliseconds.
export default defineSchema({
  patients: defineTable({
    name: v.string(),
    timeZone: v.string(),
    // Onboarding profile (optional so the seeded demo patient stays valid).
    preferredName: v.optional(v.string()), // what the band calls them
    language: v.optional(v.string()),
    extraPatience: v.optional(v.boolean()), // slower, simpler, repeat once
    ownerUserId: v.optional(v.string()),
    recovery: v.optional(
      v.object({
        procedure: v.string(), // ProcedureId in lib/onboarding/recovery.ts
        procedureOther: v.optional(v.string()),
        surgeryDate: v.string(), // "YYYY-MM-DD"
        dischargeDate: v.optional(v.string()),
        careNotes: v.optional(v.string()), // e.g. "no lifting over 10 lb"
      }),
    ),
    // Spoken agreement on the band's first boot.
    consent: v.optional(
      v.object({
        status: v.union(v.literal("agreed"), v.literal("declined")),
        at: v.number(),
        notes: v.optional(v.string()),
      }),
    ),
  }),

  careTeamMembers: defineTable({
    patientId: v.id("patients"),
    userId: v.string(),
    role: careRole,
    permissions: v.array(
      v.union(v.literal("alerts"), v.literal("summary"), v.literal("report")),
    ),
    name: v.optional(v.string()),
    relationship: v.optional(v.string()),
    isOwner: v.optional(v.boolean()),
    urgentAlerts: v.optional(v.boolean()),
    phone: v.optional(v.string()), // E.164; alerts are texted here (convex/notify.ts)
    joinedAt: v.optional(v.number()),
  })
    .index("by_patient", ["patientId"])
    .index("by_user", ["userId"]),

  invites: defineTable({
    patientId: v.id("patients"),
    token: v.string(),
    role: careRole,
    name: v.string(),
    contact: v.optional(v.string()), // email or phone; a phone becomes the member's alert number on accept
    invitedBy: v.string(), // userId
    createdAt: v.number(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    acceptedUserId: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_patient", ["patientId"]),

  // Short-lived codes a wristband shows so a family member can claim it.
  pairingCodes: defineTable({
    code: v.string(),
    deviceId: v.string(),
    tokenHash: v.string(), // SHA-256 of the band's own secret; copied to devices on claim
    createdAt: v.number(),
    expiresAt: v.number(),
    patientId: v.optional(v.id("patients")), // set once claimed
    claimedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_device", ["deviceId"]),

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

  // Wristband movement per window; long quiet stretches prompt a gentle nudge to move.
  activitySamples: defineTable({
    patientId: v.id("patients"),
    deviceId: v.string(),
    windowStart: v.number(),
    steps: v.number(),
    activeMinutes: v.number(),
    heartRate: v.optional(v.number()),
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
      v.literal("low_activity"),
      v.literal("fall"),
      v.literal("manual"),
    ),
    transcript: v.string(),
    state: v.union(
      v.literal("doing_well"),
      v.literal("sore_but_managing"),
      v.literal("struggling"),
      v.literal("unsure"),
    ),
    painScore: v.optional(v.number()), // 0-10, when they gave one
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

  // Every text Cadence sent, tried, or deliberately held back for an alert.
  textMessages: defineTable({
    patientId: v.id("patients"),
    alertId: v.optional(v.id("alerts")), // unset for "Send test"
    memberId: v.optional(v.id("careTeamMembers")),
    to: v.string(), // E.164
    body: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    reason: v.optional(v.string()), // why it failed or was skipped
    providerId: v.optional(v.string()), // Twilio message SID
    at: v.number(),
  }).index("by_patient_time", ["patientId", "at"]),

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
