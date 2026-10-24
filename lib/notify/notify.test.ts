import { afterEach, describe, expect, it, vi } from "vitest";
import { maskPhone, toE164 } from "./phone";
import {
  alertTextBody,
  MAX_TEXT_LENGTH,
  NOTIFY_THROTTLE_MS,
  planTexts,
  recipientsFor,
  type TextableMember,
} from "./plan";
import { sendSms, twilioConfig } from "./twilio";

const member = (overrides: Partial<TextableMember>): TextableMember => ({
  id: "m1",
  name: "Sarah",
  role: "care_partner",
  permissions: ["alerts", "summary"],
  phone: "+14155550101",
  urgentAlerts: true,
  ...overrides,
});

describe("toE164", () => {
  it("accepts US numbers in common formats", () => {
    expect(toE164("(415) 555-0101")).toBe("+14155550101");
    expect(toE164("415.555.0101")).toBe("+14155550101");
    expect(toE164("1 415 555 0101")).toBe("+14155550101");
  });

  it("keeps international numbers that start with +", () => {
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects emails, short numbers, and blanks", () => {
    expect(toE164("sarah@example.com")).toBeNull();
    expect(toE164("555-0101")).toBeNull();
    expect(toE164("  ")).toBeNull();
    expect(toE164("+0123456789")).toBeNull();
  });

  it("masks all but the last four digits", () => {
    expect(maskPhone("+14155550101")).toBe("•••• 0101");
  });
});

describe("recipientsFor", () => {
  const team = [
    member({ id: "owner", isOwner: true }),
    member({ id: "aide", role: "caregiver", permissions: ["alerts"], phone: "+14155550102", urgentAlerts: false }),
    member({ id: "doc", role: "clinician", permissions: ["report", "summary"], phone: "+14155550103" }),
    member({ id: "self", role: "patient", permissions: ["summary"], phone: "+14155550104" }),
    member({ id: "nophone", phone: undefined }),
  ];
  const ids = (tier: Parameters<typeof recipientsFor>[0]) => recipientsFor(tier, team).map((m) => m.id);

  it("urgent goes to members who keep urgent alerts on", () => {
    expect(ids("urgent")).toEqual(["owner"]);
  });

  it("notify goes to everyone with alerts and a phone", () => {
    expect(ids("notify")).toEqual(["owner", "aide"]);
  });

  it("ask goes only to the owner", () => {
    expect(ids("ask")).toEqual(["owner"]);
  });

  it("never texts doctors, the patient, or for info alerts", () => {
    expect(ids("info")).toEqual([]);
    for (const tier of ["urgent", "notify", "ask"] as const) {
      expect(ids(tier)).not.toContain("doc");
      expect(ids(tier)).not.toContain("self");
    }
  });
});

describe("planTexts", () => {
  const now = 1_000_000_000;
  const recentSent = [{ to: "+14155550101", at: now - 60_000, status: "sent" as const }];

  it("holds back a heads-up to a phone texted in the last 10 minutes", () => {
    expect(planTexts("notify", [member({})], recentSent, now)).toEqual([
      { memberId: "m1", to: "+14155550101", skip: "Already texted in the last 10 minutes" },
    ]);
  });

  it("always sends urgent texts", () => {
    expect(planTexts("urgent", [member({})], recentSent, now)).toEqual([{ memberId: "m1", to: "+14155550101" }]);
  });

  it("sends again once the window has passed, and ignores failed sends", () => {
    const old = [{ to: "+14155550101", at: now - NOTIFY_THROTTLE_MS - 1, status: "sent" as const }];
    const failed = [{ to: "+14155550101", at: now - 1000, status: "failed" as const }];
    expect(planTexts("notify", [member({})], old, now)[0].skip).toBeUndefined();
    expect(planTexts("notify", [member({})], failed, now)[0].skip).toBeUndefined();
  });

  it("texts a shared phone number once", () => {
    const plan = planTexts("notify", [member({ id: "a" }), member({ id: "b" })], [], now);
    expect(plan).toHaveLength(1);
  });
});

describe("alertTextBody", () => {
  it("leads with the tier, patient, and time", () => {
    expect(alertTextBody("urgent", "Margaret", "3:42 PM", "Fell in the kitchen and can't get up.")).toBe(
      "Cadence · URGENT for Margaret (3:42 PM): Fell in the kitchen and can't get up. Reply STOP to opt out.",
    );
  });

  it("cuts long reasons to two SMS segments", () => {
    const body = alertTextBody("notify", "Margaret", "3:42 PM", "pain ".repeat(200));
    expect(body.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
    expect(body).toContain("…");
    expect(body.endsWith("Reply STOP to opt out.")).toBe(true);
  });
});

describe("twilio", () => {
  const config = { accountSid: "AC123", authToken: "secret", from: "+14155550000" };
  const env = { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "secret", TWILIO_FROM: "+14155550000" };
  afterEach(() => vi.unstubAllGlobals());

  it("is a dry run until all three env vars are set", () => {
    expect(twilioConfig({ TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "secret" })).toBeNull();
    expect(twilioConfig({ TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "secret", TWILIO_FROM: "+1" })).toEqual({
      accountSid: "AC123",
      authToken: "secret",
      from: "+1",
    });
  });

  it("posts a form to the Messages endpoint with basic auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ sid: "SM1" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendSms(config, "+14155550101", "hi")).toEqual({ ok: true, sid: "SM1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(init.headers.Authorization).toBe(`Basic ${btoa("AC123:secret")}`);
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ To: "+14155550101", Body: "hi", From: "+14155550000" });
  });

  it("uses MessagingServiceSid for MG senders", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ sid: "SM1" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendSms({ ...config, from: "MG999" }, "+14155550101", "hi");
    expect((fetchMock.mock.calls[0][1].body as URLSearchParams).get("MessagingServiceSid")).toBe("MG999");
  });

  it("sends the trial template in place of the body when one is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ sid: "SM1" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const trial = twilioConfig({ ...env, TWILIO_TRIAL_TEMPLATE: "sms_internal_alerts" })!;
    await sendSms(trial, "+14155550101", "Cadence · URGENT…");
    expect((fetchMock.mock.calls[0][1].body as URLSearchParams).get("Body")).toBe("sms_internal_alerts");
  });

  it("reports Twilio's error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ code: 21608, message: "unverified number" }, { status: 400 })),
    );
    expect(await sendSms(config, "+14155550101", "hi")).toEqual({
      ok: false,
      error: "Twilio 400 (21608): unverified number",
    });
  });
});
