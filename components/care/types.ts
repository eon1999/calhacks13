import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type CareData = NonNullable<FunctionReturnType<typeof api.reports.care>>;
export type CareDose = CareData["doses"][number];
export type CareTimelineEntry = CareData["timeline"][number];
