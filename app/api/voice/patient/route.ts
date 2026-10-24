import { connection, type NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { loadPatientContext } from "@/lib/voice/context";
import { convex } from "@/lib/voice/convex";
import { handleVoiceError, jsonError, patientIdSchema } from "@/lib/voice/http";

/**
 * Patient + today's dose slots for the wearable simulator's display.
 * GET ?patientId=... (defaults to the first patient, for the demo).
 */
export async function GET(request: NextRequest): Promise<Response> {
  await connection(); // always request-time; never prerender patient data
  try {
    const requested = request.nextUrl.searchParams.get("patientId");
    const patientId = requested
      ? (patientIdSchema.parse(requested) as Id<"patients">)
      : (await convex().query(api.voice.firstPatient, {}))?._id;
    if (!patientId) return jsonError(404, "No patients yet. Seed the demo patient first.");

    const ctx = await loadPatientContext(patientId, Date.now());
    if (!ctx) return jsonError(404, "Patient not found");

    return Response.json({
      success: true,
      data: {
        patient: {
          id: ctx.patient._id,
          name: ctx.patient.name,
          preferredName: ctx.patient.preferredName ?? null,
          timeZone: ctx.patient.timeZone,
        },
        slots: ctx.slots,
      },
    });
  } catch (error: unknown) {
    return handleVoiceError(error, "patient");
  }
}
