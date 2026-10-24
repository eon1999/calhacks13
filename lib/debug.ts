/**
 * Debug/tester endpoints (app/api/debug/*) are on in development, and in
 * production only when CADENCE_DEBUG=1 (e.g. a tester build).
 */
export function debugEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CADENCE_DEBUG === "1";
}

export function debugDisabledResponse(): Response {
  return Response.json(
    { success: false, error: "Debug tools are disabled. Set CADENCE_DEBUG=1 to enable." },
    { status: 403 },
  );
}
