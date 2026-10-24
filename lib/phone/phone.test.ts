import { describe, expect, it } from "vitest";
import { buildOutboundCallRequest, MAX_CALL_MINUTES, phoneConfig, RINGING_TIMEOUT_SECONDS } from "./calls";
import { MAX_URGENT_CALLS, planUrgentCalls } from "./plan";
import {
  CALL_REASONS,
  callVariables,
  DEFAULT_CALLBACK_NUMBER,
  INSTRUCTIONS,
  urgentCallVariables,
  WELCOME_MESSAGE,
} from "./script";

describe("urgent calls", () => {
  const team = [
    { id: "m1", name: "Dan", role: "care_partner", phone: "+14155550101", urgentAlerts: true },
    { id: "m2", name: "Dr. Patel", role: "clinician", phone: "+14155550102", urgentAlerts: true },
    { id: "m3", name: "Ana", role: "caregiver", phone: "+14155550103", urgentAlerts: false },
  ];

  it("calls emergency contacts, normalising and de-duplicating their numbers", () => {
    const targets = planUrgentCalls(
      [
        { name: "Sarah", phone: "(415) 555-0110" },
        { name: "Sarah again", phone: "+1 415 555 0110" },
        { name: "Typo", phone: "call me" },
      ],
      team,
    );
    expect(targets).toEqual([{ name: "Sarah", to: "+14155550110" }]);
  });

  it("falls back to family and caregivers who get urgent alerts, never clinicians", () => {
    expect(planUrgentCalls([], team)).toEqual([{ name: "Dan", to: "+14155550101", memberId: "m1" }]);
  });

  it("caps the number of calls", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `C${i}`, phone: `+1415555020${i}` }));
    expect(planUrgentCalls(many, [])).toHaveLength(MAX_URGENT_CALLS);
  });

  it("reads the alert's reason as the problem", () => {
    const vars = urgentCallVariables({ patientName: "Margaret", contactName: "Sarah", problem: "Possible fall\n at 2:05 PM." });
    expect(vars.reason_line).toBe("Possible fall at 2:05 PM.");
    expect(WELCOME_MESSAGE.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k])).toBe(
      "Hi Sarah, this is Cadence with an urgent alert about Margaret. Possible fall at 2:05 PM.",
    );
  });

  it("is a dry run until all three Cartesia settings exist", () => {
    expect(phoneConfig({ CARTESIA_API_KEY: "k", CARTESIA_PHONE_AGENT_ID: "a" })).toBeNull();
    expect(phoneConfig({ CARTESIA_API_KEY: "k", CARTESIA_PHONE_AGENT_ID: "a", CARTESIA_FROM_NUMBER_ID: "n" })).toEqual({
      apiKey: "k",
      agentId: "a",
      fromNumberId: "n",
    });
  });
});

describe("phone agent", () => {
  const variables = callVariables({ patientName: "Margaret", contactName: "Sarah", reason: "fall" });

  it("fills every {{variable}} the script uses", () => {
    const used = new Set([...`${WELCOME_MESSAGE}\n${INSTRUCTIONS}`.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual(Object.keys(variables).sort());
  });

  it("maps the reason to its line and defaults the callback number", () => {
    expect(variables.reason_line).toBe(CALL_REASONS.fall);
    expect(variables.callback_number).toBe(DEFAULT_CALLBACK_NUMBER);
  });

  it("builds the /agents/calls body", () => {
    const req = buildOutboundCallRequest({
      agentId: "agent_123",
      fromNumberId: "num_456",
      toNumber: "+14155559876",
      variables,
    });
    expect(req).toEqual({
      from_number_id: "num_456",
      agent_id: "agent_123",
      ringing_timeout_seconds: RINGING_TIMEOUT_SECONDS,
      max_call_duration_minutes: MAX_CALL_MINUTES,
      outbound_calls: [{ to_number: "+14155559876", dynamic_variables: variables }],
    });
  });

  it("rejects numbers that aren't E.164", () => {
    expect(() =>
      buildOutboundCallRequest({ agentId: "a", fromNumberId: "n", toNumber: "(415) 555-9876", variables }),
    ).toThrow();
  });
});
