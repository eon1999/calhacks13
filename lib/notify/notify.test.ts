import { afterEach, describe, expect, it, vi } from "vitest";
import { maskPhone, toE164 } from "./phone";
import {
  alertTextBody,
  getsDailySummary,
  hasUrgentGap,
  MAX_TEXT_LENGTH,
  NOTIFY_THROTTLE_MS,
  planTexts,
  QUIET_HOURS_DROPPED,
  QUIET_HOURS_HELD,
  recipientsFor,
  type TextableMember,
} from "./plan";
import { PRESETS } from "./preferences";
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

describe("notification preferences in the plan", () => {
  const TZ = "America/Los_Angeles";
  const night = Date.parse("2026-10-24T23:30:00-07:00");
  const day = Date.parse("2026-10-24T14:00:00-07:00");
  const emergencies = { ...PRESETS.emergencies.values, summaryTime: "19:00" };
  const everything = { ...PRESETS.everything.values, summaryTime: "19:00" };

  it("holds heads-ups in quiet hours for the daily summary", () => {
    expect(planTexts("notify", [member({})], [], night, TZ)).toEqual([
      { memberId: "m1", to: "+14155550101", skip: QUIET_HOURS_HELD, held: true },
    ]);
    expect(planTexts("notify", [member({})], [], day, TZ)).toEqual([{ memberId: "m1", to: "+14155550101" }]);
  });

  it("always sends urgent, even in quiet hours", () => {
    expect(planTexts("urgent", [member({})], [], night, TZ)).toEqual([{ memberId: "m1", to: "+14155550101" }]);
  });

  it("holds 'please check in' requests in quiet hours too", () => {
    expect(planTexts("ask", [member({ isOwner: true })], [], night, TZ)[0].held).toBe(true);
  });

  it("says when a held text has no summary to go into", () => {
    const aide = member({ id: "aide", role: "caregiver", permissions: ["alerts"] });
    expect(planTexts("notify", [aide], [], night, TZ)).toEqual([
      { memberId: "aide", to: "+14155550101", skip: QUIET_HOURS_DROPPED },
    ]);
  });

  it("sends everything at night to members who chose Everything", () => {
    expect(planTexts("notify", [member({ preferences: everything })], [], night, TZ)[0].skip).toBeUndefined();
  });

  it("leaves out members who switched a tier off", () => {
    const team = [
      member({ id: "sarah", isOwner: true, preferences: emergencies }),
      member({ id: "maria", role: "caregiver", permissions: ["alerts"], phone: "+14155550102" }),
    ];
    expect(recipientsFor("notify", team).map((m) => m.id)).toEqual(["maria"]);
    expect(recipientsFor("ask", team)).toEqual([]);
    expect(recipientsFor("urgent", team).map((m) => m.id)).toEqual(["sarah", "maria"]);
  });

  it("lets a member's own choice override the legacy urgent flag", () => {
    expect(recipientsFor("urgent", [member({ urgentAlerts: false, preferences: { urgent: true } })])).toHaveLength(1);
    expect(recipientsFor("urgent", [member({ urgentAlerts: true, preferences: { urgent: false } })])).toHaveLength(0);
  });

  it("flags a team where nobody with a phone gets urgent texts", () => {
    expect(hasUrgentGap([member({ preferences: { urgent: false } })])).toBe(true);
    expect(hasUrgentGap([member({ phone: undefined })])).toBe(true);
    expect(hasUrgentGap([member({}), member({ id: "x", preferences: { urgent: false } })])).toBe(false);
  });

  it("sends the daily summary only to family with the permission, a phone, and it on", () => {
    expect(getsDailySummary(member({}))).toBe(true);
    expect(getsDailySummary(member({ preferences: emergencies }))).toBe(false);
    expect(getsDailySummary(member({ role: "caregiver", permissions: ["alerts"] }))).toBe(false);
    expect(getsDailySummary(member({ role: "clinician", permissions: ["report", "summary"] }))).toBe(false);
    expect(getsDailySummary(member({ phone: undefined }))).toBe(false);
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
