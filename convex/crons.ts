import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily recovery summaries go out at each member's own time (convex/summary.ts).
crons.interval("daily summaries", { minutes: 15 }, internal.summary.sendDueSummaries);

export default crons;
