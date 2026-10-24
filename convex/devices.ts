import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { resolveAlerts } from "./alerts";
import { DEVICE_OFFLINE_MS, loadSlots } from "./doses";
import { ledState, type LedState } from "../lib/dose-engine";
import { activityPayload } from "../lib/schemas";
import { requireManager } from "./onboarding";

// Devices (wristband, pillbox) and what they report. Firmware posts to
// convex/http.ts with `Authorization: Bearer <token>`; we store only the
// token's SHA-256 (devices.tokenHash), never the token.

const HEX64 = /^[0-9a-f]{64}$/;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deviceByTokenHash(ctx: QueryCtx, tokenHash: string): Promise<Doc<"devices"> | null> {
  return ctx.db
    .query("devices")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
}

/** Marks the device as alive, and clears its "offline" alert if it had one. */
export async function touchDevice(ctx: MutationCtx, device: Doc<"devices">, firmwareVersion?: string) {
  const now = Date.now();
  const wasOffline = device.lastSeenAt !== undefined && now - device.lastSeenAt >= DEVICE_OFFLINE_MS;
  await ctx.db.patch(device._id, {
    lastSeenAt: now,
    // Set on any HTTP contact: only devices that really report get offline alerts.
    firmwareVersion: firmwareVersion ?? device.firmwareVersion ?? "unknown",
  });
  if (wasOffline) {
    await resolveAlerts(ctx, device.patientId, ["device_offline"], { refId: device.deviceId, by: "Back online" });
  }
}

export async function recordActivity(
  ctx: MutationCtx,
  patientId: Id<"patients">,
  input: { deviceId: string; steps: number; activeMinutes: number; heartRate?: number },
  at = Date.now(),
): Promise<Id<"activitySamples">> {
  const sample = activityPayload.parse(input);
  return ctx.db.insert("activitySamples", { patientId, windowStart: at, ...sample });
}

/** What the device should do now; returned on every heartbeat. */
export async function commandsFor(ctx: QueryCtx, device: Doc<"devices">): Promise<{ led: LedState; buzz: boolean }> {
  const patient = await ctx.db.get(device.patientId);
  if (!patient) return { led: "off", buzz: false };
  const now = Date.now();
  const led = ledState(await loadSlots(ctx, patient, now), now);
  const open = await ctx.db
    .query("alerts")
    .withIndex("by_patient_status", (q) => q.eq("patientId", device.patientId).eq("status", "open"))
    .collect();
  // The band buzzes for the second reminder and while a fall check is waiting for an answer.
  const buzz =
    device.kind === "wristband" &&
    open.some(
      (a) =>
        now - a.createdAt < 2 * 60_000 &&
        (a.kind === "fall_check" || (a.kind === "dose_reminder" && a.reason.startsWith("Second"))),
    );
  return { led, buzz };
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

export const list = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect();
    const now = Date.now();
    return devices.map((d) => ({
      _id: d._id,
      deviceId: d.deviceId,
      kind: d.kind,
      label: d.label,
      lastSeenAt: d.lastSeenAt,
      firmwareVersion: d.firmwareVersion,
      online: d.lastSeenAt !== undefined && now - d.lastSeenAt < DEVICE_OFFLINE_MS,
    }));
  },
});

/**
 * Registers a device by the hash of a token the browser generated. The token
 * itself is shown once in Settings and flashed to the firmware.
 */
export const register = mutation({
  args: {
    userId: v.string(),
    patientId: v.id("patients"),
    kind: v.union(v.literal("wristband"), v.literal("med_station")),
    deviceId: v.string(),
    tokenHash: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, { userId, patientId, kind, deviceId, tokenHash, label }) => {
    await requireManager(ctx, patientId, userId);
    const id = deviceId.trim();
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(id)) throw new Error("Device id: 2–64 letters, numbers, - or _");
    if (!HEX64.test(tokenHash)) throw new Error("tokenHash must be a hex SHA-256");
    const clash = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", id))
      .first();
    if (clash) throw new Error(`A device called "${id}" is already registered`);
    return ctx.db.insert("devices", {
      patientId,
      kind,
      deviceId: id,
      tokenHash,
      label: label?.trim().slice(0, 60) || undefined,
    });
  },
});

export const remove = mutation({
  args: { userId: v.string(), deviceId: v.id("devices") },
  handler: async (ctx, { userId, deviceId }) => {
    const device = await ctx.db.get(deviceId);
    if (!device) return;
    await requireManager(ctx, device.patientId, userId);
    await ctx.db.delete(deviceId);
  },
});

/** Demo: pretend the device last reported `minutesAgo` minutes ago. */
export async function backdateDevice(ctx: MutationCtx, device: Doc<"devices">, minutesAgo: number) {
  await ctx.db.patch(device._id, {
    lastSeenAt: Date.now() - minutesAgo * 60_000,
    firmwareVersion: device.firmwareVersion ?? "simulated",
  });
}

