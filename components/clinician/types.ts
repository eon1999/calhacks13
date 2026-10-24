import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type ClinicianData = NonNullable<FunctionReturnType<typeof api.reports.clinician>>;
