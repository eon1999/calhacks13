import { connection, type NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { debugDisabledResponse, debugEnabled } from "@/lib/debug";
import { convex } from "@/lib/voice/convex";
import { handleVoiceError, jsonError, patientIdSchema } from "@/lib/voice/http";

/** Recent alerts, check-ins, safety events and dose confirmations. GET ?patientId= */
export async function GET(request: NextRequest): Promise<Response> {
  await connection();
  if (!debugEnabled()) return debugDisabledResponse();
  try {
    const raw = request.nextUrl.searchParams.get("patientId");
    if (!raw) return jsonError(400, "patientId is required");
    const patientId = patientIdSchema.parse(raw) as Id<"patients">;
    const data = await convex().query(api.debug.activity, { patientId });
    return Response.json({ success: true, data });
  } catch (error: unknown) {
    return handleVoiceError(error, "debug/activity");
  }
}
