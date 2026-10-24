import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Dose engine: open dose windows, remind at T and T+15, mark misses, check
// for long stillness and silent devices. Server-side, so it works with no screen open.
crons.interval("dose engine", { minutes: 1 }, internal.doses.tick, {});

// Daily care-partner summary at 8 PM in each patient's time zone.
crons.hourly("daily summaries", { minuteUTC: 2 }, internal.reports.dueDailySummaries, {});

// Daily summary *texts* (short, rule-based) at each member's own time (convex/summary.ts).
crons.interval("daily summary texts", { minutes: 15 }, internal.summary.sendDueSummaries, {});

export default crons;
