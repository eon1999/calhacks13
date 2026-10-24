import { api } from "@/convex/_generated/api";
import { convex } from "@/lib/voice/convex";
import { jsonError } from "@/lib/voice/http";

/** Creates the demo patient and medication schedule (idempotent). */
export async function POST(): Promise<Response> {
  try {
    const patientId = await convex().mutation(api.seed.seedDemo, {});
    return Response.json({ success: true, data: { patientId } });
  } catch (error: unknown) {
    console.error("[demo] seed failed", error);
    return jsonError(500, "Seeding failed");
  }
}
