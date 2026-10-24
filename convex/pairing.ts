import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { newPairingCode, normalizePairingCode, PAIRING_CODE_TTL_MS } from "../lib/onboarding/pairing";
import { requireManager } from "./onboarding";

// Wristband pairing. The band keeps its own secret token and sends only its
// SHA-256 hash with requestCode; claiming the code copies that hash into
// `devices`, so device auth (convex/http.ts TODO) can verify the band later.

export const requestCode = mutation({
  args: { deviceId: v.string(), tokenHash: v.string() },
  handler: async (ctx, { deviceId, tokenHash }) => {
    if (!deviceId.trim() || deviceId.length > 128) throw new Error("Invalid device id");
    if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error("tokenHash must be a hex SHA-256");

    const paired = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
      .first();
    if (paired) return { state: "paired" as const };

    const now = Date.now();
    const current = await ctx.db
      .query("pairingCodes")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .order("desc")
      .first();
    if (current && !current.claimedAt && current.expiresAt > now && current.tokenHash === tokenHash) {
      return { state: "code" as const, code: current.code, expiresAt: current.expiresAt };
    }

    // Avoid handing out a code another band is still showing.
    let code = newPairingCode();
    for (let i = 0; i < 5; i++) {
      const clash = await ctx.db
        .query("pairingCodes")
        .withIndex("by_code", (q) => q.eq("code", code))
        .filter((q) => q.gt(q.field("expiresAt"), now))
        .first();
      if (!clash) break;
      code = newPairingCode();
    }
    const expiresAt = now + PAIRING_CODE_TTL_MS;
    await ctx.db.insert("pairingCodes", { code, deviceId, tokenHash, createdAt: now, expiresAt });
    return { state: "code" as const, code, expiresAt };
  },
});

/** What the band should show: its code, or who it now belongs to. */
export const deviceStatus = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
      .first();
    if (!device) return { state: "unpaired" as const };
    const patient = await ctx.db.get(device.patientId);
    return {
      state: "paired" as const,
      patientId: device.patientId,
      patientName: patient?.preferredName ?? patient?.name ?? "",
      consent: patient?.consent?.status ?? null,
    };
  },
});

export const claim = mutation({
  args: { userId: v.string(), patientId: v.id("patients"), code: v.string() },
  handler: async (ctx, { userId, patientId, code }) => {
    await requireManager(ctx, patientId, userId);
    const normalized = normalizePairingCode(code);
    if (!normalized) throw new Error("Enter the 6-digit code shown on the band");

    const now = Date.now();
    const pending = await ctx.db
      .query("pairingCodes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .filter((q) => q.and(q.gt(q.field("expiresAt"), now), q.eq(q.field("claimedAt"), undefined)))
      .first();
    if (!pending) throw new Error("That code didn't match a band. Check the band's screen and try again.");

    const existing = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", pending.deviceId))
      .first();
    if (existing && existing.patientId !== patientId) throw new Error("That band is already paired to someone else");
    if (!existing) {
      await ctx.db.insert("devices", {
        patientId,
        kind: "wristband",
        deviceId: pending.deviceId,
        tokenHash: pending.tokenHash,
        lastSeenAt: now,
      });
    }
    await ctx.db.patch(pending._id, { patientId, claimedAt: now });
    return { deviceId: pending.deviceId };
  },
});
