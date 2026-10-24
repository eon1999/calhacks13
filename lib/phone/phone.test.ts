import { describe, expect, it } from "vitest";
import { buildOutboundCallRequest, MAX_CALL_MINUTES, RINGING_TIMEOUT_SECONDS } from "./calls";
import { CALL_REASONS, callVariables, DEFAULT_CALLBACK_NUMBER, INSTRUCTIONS, WELCOME_MESSAGE } from "./script";

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
