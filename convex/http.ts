import { httpRouter } from "convex/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { httpAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { commandsFor, deviceByTokenHash, recordActivity, sha256Hex, touchDevice } from "./devices";
import { lidOpened } from "./doses";
import { reportFall, reportSos } from "./safety";
import { activityPayload, devicePayload } from "../lib/schemas";

// Device ingest. Every request carries `Authorization: Bearer <device token>`;
// the server timestamps everything on receipt, so devices need no clock.
//
//   POST /device/activity   { deviceId, steps, activeMinutes, heartRate? }
//   POST /device/event      { deviceId, type: "lid_open" | "sos" | "fall", peakG? }
//   POST /device/heartbeat  { deviceId, firmwareVersion? }  → { led, buzz }

const http = httpRouter();

const heartbeatBody = z.object({ deviceId: z.string(), firmwareVersion: z.string().max(40).optional() });

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

type Authed = { device: Doc<"devices">; body: unknown } | Response;

async function authenticate(ctx: ActionCtx, request: Request): Promise<Authed> {
  const auth = request.headers.get("Authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  if (!token) return json({ error: "Missing bearer token" }, 401);
  const device = await ctx.runQuery(internal.http.deviceForToken, { tokenHash: await sha256Hex(token) });
  if (!device) return json({ error: "Unknown device token" }, 401);
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Body must be JSON" }, 400);
  const claimed = (body as { deviceId?: unknown }).deviceId;
  if (claimed !== device.deviceId) return json({ error: "deviceId doesn't match the token" }, 403);
  return { device, body };
}

export const deviceForToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => deviceByTokenHash(ctx, tokenHash),
});

export const ingestActivity = internalMutation({
  args: { deviceId: v.id("devices"), body: v.any() },
  handler: async (ctx, { deviceId, body }) => {
    const device = await ctx.db.get(deviceId);
    if (!device) throw new Error("Device not found");
    await touchDevice(ctx, device);
    await recordActivity(ctx, device.patientId, activityPayload.parse(body));
  },
});

export const ingestEvent = internalMutation({
  args: { deviceId: v.id("devices"), body: v.any() },
  handler: async (ctx, { deviceId, body }) => {
    const device = await ctx.db.get(deviceId);
    if (!device) throw new Error("Device not found");
    await touchDevice(ctx, device);
    const event = devicePayload.parse(body);
    switch (event.type) {
      case "lid_open":
        return { match: await lidOpened(ctx, device.patientId, { deviceId: device.deviceId }) };
      case "fall":
        await reportFall(ctx, device.patientId, { payload: { peakG: event.peakG, deviceId: device.deviceId }, prompt: true });
        return {};
      case "sos":
        await reportSos(ctx, device.patientId, { payload: { deviceId: device.deviceId }, prompt: true });
        return {};
    }
  },
});

export const heartbeat = internalMutation({
  args: { deviceId: v.id("devices"), firmwareVersion: v.optional(v.string()) },
  handler: async (ctx, { deviceId, firmwareVersion }) => {
    const device = await ctx.db.get(deviceId);
    if (!device) throw new Error("Device not found");
    await touchDevice(ctx, device, firmwareVersion);
    return commandsFor(ctx, device);
  },
});

http.route({
  path: "/device/activity",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authed = await authenticate(ctx, request);
    if (authed instanceof Response) return authed;
    const parsed = activityPayload.safeParse(authed.body);
    if (!parsed.success) return json({ error: z.prettifyError(parsed.error) }, 400);
    await ctx.runMutation(internal.http.ingestActivity, { deviceId: authed.device._id, body: parsed.data });
    return json({ ok: true });
  }),
});

http.route({
  path: "/device/event",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authed = await authenticate(ctx, request);
    if (authed instanceof Response) return authed;
    const parsed = devicePayload.safeParse(authed.body);
    if (!parsed.success) return json({ error: z.prettifyError(parsed.error) }, 400);
    const result = await ctx.runMutation(internal.http.ingestEvent, { deviceId: authed.device._id, body: parsed.data });
    return json({ ok: true, ...result });
  }),
});

http.route({
  path: "/device/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authed = await authenticate(ctx, request);
    if (authed instanceof Response) return authed;
    const parsed = heartbeatBody.safeParse(authed.body);
    if (!parsed.success) return json({ error: z.prettifyError(parsed.error) }, 400);
    const commands = await ctx.runMutation(internal.http.heartbeat, {
      deviceId: authed.device._id,
      firmwareVersion: parsed.data.firmwareVersion,
    });
    return json(commands);
  }),
});

export default http;
