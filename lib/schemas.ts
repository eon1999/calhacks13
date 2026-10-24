import { z } from "zod";

// Shared by the Next.js app and Convex functions.
// One window of wristband movement, used to spot long stretches of inactivity.
export const activityPayload = z.object({
  deviceId: z.string(),
  steps: z.number().int().min(0),
  activeMinutes: z.number().min(0),
  heartRate: z.number().min(20).max(250).optional(),
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

// How a post-op check-in went overall. Warning signs go in red_flag, not here.
export const checkInState = z.enum([
  "doing_well", // comfortable, getting around, eating and sleeping okay
  "sore_but_managing", // pain or stiffness, but controlled by the current plan
  "struggling", // pain not controlled, very tired, not eating or sleeping, low mood
  "unsure",
]);

export const alertTier = z.enum(["info", "ask", "notify", "urgent"]);

export type ActivityPayload = z.infer<typeof activityPayload>;
export type DevicePayload = z.infer<typeof devicePayload>;
export type HeartbeatResponse = z.infer<typeof heartbeatResponse>;
