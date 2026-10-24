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
    health: v.optional(
      v.object({
        conditions: v.array(v.string()), // other conditions besides the surgery
        allergies: v.array(v.string()),
        noKnownAllergies: v.optional(v.boolean()),
        mobility: v.optional(v.string()), // MobilityId in lib/onboarding/health.ts
        notes: v.optional(v.string()),
      }),
    ),
    // People to call in an emergency; not necessarily on the care team.
    emergencyContacts: v.optional(
      v.array(
        v.object({
          name: v.string(),
          relationship: v.optional(v.string()),
          phone: v.string(),
        }),
      ),
    ),
    // Set on the seeded demo patient so every screen can label its data as simulated.
    isDemo: v.optional(v.boolean()),
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
    joinedAt: v.optional(v.number()),
  })
    .index("by_patient", ["patientId"])
    .index("by_user", ["userId"]),

  invites: defineTable({
    patientId: v.id("patients"),
    token: v.string(),
    role: careRole,
    name: v.string(),
    contact: v.optional(v.string()), // email or phone; not sent anywhere yet
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
    // Dose engine bookkeeping (convex/doses.ts): reminders at T and T+15.
    remindersSent: v.optional(v.number()),
    lastRemindedAt: v.optional(v.number()),
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
    // What raised it (AlertKind in lib/alerts.ts) and the row it's about.
    // "ask"-tier alerts with a kind are prompts for the patient's band/hub to speak.
    kind: v.optional(v.string()),
    refId: v.optional(v.string()),
    deliveredAt: v.optional(v.number()), // when the hub/band spoke an "ask" prompt
  })
    .index("by_patient_status", ["patientId", "status"])
    .index("by_patient_created", ["patientId", "createdAt"]),

  summaries: defineTable({
    patientId: v.id("patients"),
    kind: v.union(v.literal("daily"), v.literal("clinician")),
    periodStart: v.number(),
    periodEnd: v.number(),
    body: v.string(), // markdown
    evidenceIds: v.array(v.string()),
    model: v.string(), // Claude model id, or "template" when Claude wasn't available
    createdAt: v.number(),
    // Structured report (ReportSections in lib/reports/types.ts) for the clinician page.
    sections: v.optional(v.any()),
  }).index("by_patient_kind", ["patientId", "kind"]),

  // Every Claude prompt and response from report/summary jobs, for review before judging.
  aiLogs: defineTable({
    patientId: v.id("patients"),
    job: v.string(),
    model: v.string(),
    prompt: v.string(),
    response: v.string(),
    ok: v.boolean(),
    error: v.optional(v.string()),
    at: v.number(),
  }).index("by_patient", ["patientId", "at"]),

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

  // What the band should watch for (heart rate, temperature, movement), researched
  // by convex/agent.ts. `result` matches watchListSchema in lib/watch-list.ts.
  watchLists: defineTable({
    patientId: v.id("patients"),
    status: v.union(v.literal("researching"), v.literal("ready"), v.literal("failed")),
    requestedAt: v.number(),
    completedAt: v.optional(v.number()),
    result: v.optional(v.any()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
  }).index("by_patient", ["patientId"]),

  devices: defineTable({
    patientId: v.id("patients"),
    kind: v.union(v.literal("wristband"), v.literal("med_station")),
    deviceId: v.string(),
    tokenHash: v.string(),
    lastSeenAt: v.optional(v.number()),
    firmwareVersion: v.optional(v.string()),
    label: v.optional(v.string()),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_tokenHash", ["tokenHash"])
    .index("by_patient", ["patientId"]),
});
