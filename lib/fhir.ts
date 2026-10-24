// FHIR R4 export of the clinician report: a `collection` Bundle with the
// patient, each scheduled dose as a MedicationAdministration, and pain scores,
// daily steps, daily average heart rate and possible falls as Observations.
// Pure: built in the browser from the clinician query's data.

import { doseOutcome, type ReportDose, type ReportStats } from "./reports/stats";

export interface FhirInput {
  patient: { _id: string; name: string; isDemo: boolean };
  stats: Pick<ReportStats, "days">;
  evidence: {
    doses: ReportDose[];
    checkIns: { id: string; at: number; painScore?: number }[];
    events: { id: string; type: string; at: number; resolution?: string }[];
  };
  generatedAt: number;
}

type Resource = Record<string, unknown> & { resourceType: string; id: string };

const LOINC = "http://loinc.org";
const DEMO_TAG = { system: "https://cadence.example/tags", code: "simulated", display: "Simulated demo data" };

const iso = (at: number) => new Date(at).toISOString();

function loinc(code: string, display: string) {
  return { coding: [{ system: LOINC, code, display }], text: display };
}

const vitalSigns = [
  {
    coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }],
  },
];
const survey = [
  { coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey", display: "Survey" }] },
];
const activity = [
  { coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "activity", display: "Activity" }] },
];

export function buildFhirBundle(input: FhirInput): Record<string, unknown> {
  const { patient } = input;
  const patientRef = { reference: `Patient/${patient._id}` };
  const meta = patient.isDemo ? { tag: [DEMO_TAG] } : undefined;
  const withMeta = (r: Resource): Resource => (meta ? { ...r, meta } : r);
  const resources: Resource[] = [];

  const parts = patient.name.trim().split(/\s+/);
  resources.push(
    withMeta({
      resourceType: "Patient",
      id: patient._id,
      name: [{ text: patient.name, given: parts.slice(0, -1).length ? parts.slice(0, -1) : parts, family: parts.length > 1 ? parts.at(-1) : undefined }],
    }),
  );

  for (const d of input.evidence.doses) {
    const outcome = doseOutcome(d);
    if (outcome === "pending" || outcome === "extra") continue;
    const taken = outcome !== "missed";
    resources.push(
      withMeta({
        resourceType: "MedicationAdministration",
        id: d.id,
        status: taken ? "completed" : "not-done",
        medicationCodeableConcept: { text: d.medicationName },
        subject: patientRef,
        effectiveDateTime: iso(taken ? (d.confirmedAt ?? d.openedAt ?? d.scheduledFor) : d.scheduledFor),
        ...(outcome === "late" ? { note: [{ text: "Taken after its reminder window" }] } : {}),
        ...(taken ? {} : { statusReason: [{ text: "No pillbox opening or confirmation within the dose window" }] }),
      }),
    );
  }

  for (const c of input.evidence.checkIns) {
    if (c.painScore === undefined) continue;
    resources.push(
      withMeta({
        resourceType: "Observation",
        id: `pain-${c.id}`,
        status: "final",
        category: survey,
        code: loinc("72514-3", "Pain severity - 0-10 verbal numeric rating [Score] - Reported"),
        subject: patientRef,
        effectiveDateTime: iso(c.at),
        valueInteger: Math.round(c.painScore),
      }),
    );
  }

  for (const day of input.stats.days) {
    if (day.steps > 0) {
      resources.push(
        withMeta({
          resourceType: "Observation",
          id: `steps-${day.date}`,
          status: "final",
          category: activity,
          code: loinc("41950-7", "Number of steps in 24 hour Measured"),
          subject: patientRef,
          effectiveDateTime: day.date,
          valueQuantity: { value: day.steps, unit: "/d", system: "http://unitsofmeasure.org", code: "/d" },
        }),
      );
    }
    if (day.avgHeartRate !== null) {
      resources.push(
        withMeta({
          resourceType: "Observation",
          id: `hr-${day.date}`,
          status: "final",
          category: vitalSigns,
          code: loinc("8867-4", "Heart rate"),
          subject: patientRef,
          effectiveDateTime: day.date,
          valueQuantity: { value: day.avgHeartRate, unit: "/min", system: "http://unitsofmeasure.org", code: "/min" },
          note: [{ text: "Daily average from the wristband" }],
        }),
      );
    }
  }

  for (const e of input.evidence.events) {
    if (e.type !== "fall") continue;
    resources.push(
      withMeta({
        resourceType: "Observation",
        id: `fall-${e.id}`,
        status: "final",
        code: { text: "Possible fall" },
        subject: patientRef,
        effectiveDateTime: iso(e.at),
        valueString: e.resolution ?? "pending",
      }),
    );
  }

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: iso(input.generatedAt),
    ...(meta ? { meta } : {}),
    entry: resources.map((resource) => ({ fullUrl: `urn:uuid:${resource.resourceType}-${resource.id}`, resource })),
  };
}
