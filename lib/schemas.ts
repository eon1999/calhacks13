import { z } from "zod";

// Shared by the Next.js app and Convex functions.
export const tremorPayload = z.object({
  deviceId: z.string(),
  tremorIndex: z.number().min(0).max(100),
  bandRmsMg: z.number(),
  peakHz: z.number(),
  activity: z.enum(["rest", "active"]),
});

export const devicePayload = z.discriminatedUnion("type", [
  z.object({ deviceId: z.string(), type: z.literal("lid_open") }),
  z.object({ deviceId: z.string(), type: z.literal("sos") }),
  z.object({ deviceId: z.string(), type: z.literal("fall"), peakG: z.number() }),
]);

export const heartbeatResponse = z.object({
  led: z.enum(["due", "taken", "missed", "off"]),
  buzz: z.boolean(),
});

export const checkInState = z.enum([
  "moving_well",
  "stiff_shaky",
  "extra_movement",
  "unsure",
]);

export const alertTier = z.enum(["info", "ask", "notify", "urgent"]);

export type TremorPayload = z.infer<typeof tremorPayload>;
export type DevicePayload = z.infer<typeof devicePayload>;
export type HeartbeatResponse = z.infer<typeof heartbeatResponse>;
