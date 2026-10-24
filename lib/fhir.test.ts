import { describe, expect, it } from "vitest";
import { buildFhirBundle, type FhirInput } from "./fhir";

const T = Date.UTC(2026, 9, 24, 15, 0);
const MIN = 60_000;

const input: FhirInput = {
  patient: { _id: "p1", name: "Margaret Lee", isDemo: true },
  stats: {
    days: [
      { date: "2026-10-24", onTime: 1, late: 0, missed: 1, pending: 0, steps: 2400, activeMinutes: 30, avgHeartRate: 78.5, avgPain: 4 },
      { date: "2026-10-25", onTime: 0, late: 0, missed: 0, pending: 0, steps: 0, activeMinutes: 0, avgHeartRate: null, avgPain: null },
    ],
  },
  evidence: {
    doses: [
      { id: "d1", medicationId: "m", medicationName: "Acetaminophen", scheduledFor: T, windowMinutes: 60, status: "taken", openedAt: T + 2 * MIN, confirmedAt: T + 3 * MIN },
      { id: "d2", medicationId: "m", medicationName: "Acetaminophen", scheduledFor: T + 6 * 60 * MIN, windowMinutes: 60, status: "missed" },
      { id: "d3", medicationId: "m", medicationName: "Acetaminophen", scheduledFor: T + 9 * 60 * MIN, windowMinutes: 60, status: "due" },
    ],
    checkIns: [
      { id: "c1", at: T + 60 * MIN, painScore: 4 },
      { id: "c2", at: T + 90 * MIN },
    ],
    events: [
      { id: "e1", type: "fall", at: T + 120 * MIN, resolution: "ok" },
      { id: "e2", type: "sos", at: T + 130 * MIN },
    ],
  },
  generatedAt: T + 10 * 60 * MIN,
};

type Entry = { resource: Record<string, unknown> & { resourceType: string; id: string } };

describe("buildFhirBundle", () => {
  const bundle = buildFhirBundle(input) as { resourceType: string; type: string; entry: Entry[] };
  const byId = (id: string) => bundle.entry.find((e) => e.resource.id === id)?.resource;

  it("is a collection bundle labelled as simulated", () => {
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    expect(byId("p1")).toMatchObject({ resourceType: "Patient", meta: { tag: [{ code: "simulated" }] } });
  });

  it("maps doses: taken → completed, missed → not-done, pending skipped", () => {
    expect(byId("d1")).toMatchObject({
      resourceType: "MedicationAdministration",
      status: "completed",
      medicationCodeableConcept: { text: "Acetaminophen" },
      effectiveDateTime: new Date(T + 3 * MIN).toISOString(),
    });
    expect(byId("d2")).toMatchObject({ status: "not-done" });
    expect(byId("d3")).toBeUndefined();
  });

  it("adds pain, steps, heart rate and fall observations", () => {
    expect(byId("pain-c1")).toMatchObject({ code: { coding: [{ code: "72514-3" }] }, valueInteger: 4 });
    expect(byId("pain-c2")).toBeUndefined();
    expect(byId("steps-2026-10-24")).toMatchObject({ code: { coding: [{ code: "41950-7" }] }, valueQuantity: { value: 2400 } });
    expect(byId("steps-2026-10-25")).toBeUndefined();
    expect(byId("hr-2026-10-24")).toMatchObject({ code: { coding: [{ code: "8867-4" }] }, valueQuantity: { value: 78.5, unit: "/min" } });
    expect(byId("fall-e1")).toMatchObject({ code: { text: "Possible fall" }, valueString: "ok" });
    expect(byId("fall-e2")).toBeUndefined();
  });

  it("gives every entry a unique fullUrl", () => {
    const urls = (bundle.entry as unknown as { fullUrl: string }[]).map((e) => e.fullUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
