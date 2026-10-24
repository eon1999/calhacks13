import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  isCareAlert,
  isPromptKind,
  PROMPT_TTL_MS,
  TIER_RANK,
  URGENT_DEDUP_MS,
  type AlertKind,
  type AlertTier,
} from "../lib/alerts";

// Alerts drive two screens: "ask" prompts are spoken by the patient's band or
// hub; notify/urgent alerts land on the care dashboard until acknowledged.
// TODO(auth): public like convex/voice.ts; gate on care-team membership with Clerk.

const DAY_MS = 86_400_000;

export interface RaiseArgs {
  patientId: Id<"patients">;
  tier: AlertTier;
  kind: AlertKind;
  reason: string;
  refId?: string;
  at?: number;
}

/**
 * Inserts an alert. Urgent alerts within a couple of minutes of another open
 * urgent alert are merged (the band and the voice agent often both raise one
 * for the same moment).
 */
export async function raiseAlert(ctx: MutationCtx, args: RaiseArgs): Promise<Id<"alerts">> {
  const at = args.at ?? Date.now();
  if (args.tier === "urgent") {
    const recent = await ctx.db
      .query("alerts")
      .withIndex("by_patient_created", (q) => q.eq("patientId", args.patientId).gte("createdAt", at - URGENT_DEDUP_MS))
      .collect();
    const dup = recent.find((a) => a.tier === "urgent" && a.status === "open");
    if (dup) {
      if (!dup.reason.includes(args.reason)) {
        await ctx.db.patch(dup._id, { reason: `${dup.reason} · ${args.reason}`.slice(0, 600) });
      }
      return dup._id;
    }
  }
  return ctx.db.insert("alerts", {
    patientId: args.patientId,
    tier: args.tier,
    kind: args.kind,
    reason: args.reason,
    refId: args.refId,
    createdAt: at,
    status: "open",
  });
}

/** Closes open alerts of these kinds (optionally for one ref), e.g. reminders once a dose is taken. */
export async function resolveAlerts(
  ctx: MutationCtx,
  patientId: Id<"patients">,
  kinds: AlertKind[],
  opts: { refId?: string; by?: string } = {},
): Promise<number> {
  const open = await ctx.db
    .query("alerts")
    .withIndex("by_patient_status", (q) => q.eq("patientId", patientId).eq("status", "open"))
    .collect();
  const matches = open.filter(
    (a) => a.kind && (kinds as string[]).includes(a.kind) && (opts.refId === undefined || a.refId === opts.refId),
  );
  const now = Date.now();
  for (const a of matches) {
    await ctx.db.patch(a._id, { status: "resolved", acknowledgedBy: opts.by ?? "Cadence", acknowledgedAt: now });
  }
  return matches.length;
}

function byUrgency(a: Doc<"alerts">, b: Doc<"alerts">): number {
  return TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.createdAt - a.createdAt;
}

/** The care dashboard's alert list: open ones first, then the last day's handled ones. */
export const forCare = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const now = Date.now();
    const recent = await ctx.db
      .query("alerts")
      .withIndex("by_patient_created", (q) => q.eq("patientId", patientId).gte("createdAt", now - DAY_MS))
      .collect();
    // Open alerts older than a day still matter.
    const open = await ctx.db
      .query("alerts")
      .withIndex("by_patient_status", (q) => q.eq("patientId", patientId).eq("status", "open"))
      .collect();
    const seen = new Set<string>();
    const all = [...open, ...recent].filter((a) => !seen.has(a._id) && seen.add(a._id) && isCareAlert(a));
    return {
      open: all.filter((a) => a.status === "open").sort(byUrgency),
      handled: all
        .filter((a) => a.status !== "open")
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10),
    };
  },
});

export const acknowledge = mutation({
  args: { alertId: v.id("alerts"), by: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { alertId, by, note }) => {
    const alert = await ctx.db.get(alertId);
    if (!alert) throw new Error("Alert not found");
    if (alert.status !== "open") return;
    const who = by.trim().slice(0, 80) || "Care team";
    await ctx.db.patch(alertId, {
      status: "acknowledged",
      acknowledgedBy: note ? `${who}: ${note.trim().slice(0, 120)}` : who,
      acknowledgedAt: Date.now(),
    });
  },
});

export const resolve = mutation({
  args: { alertId: v.id("alerts"), by: v.string() },
  handler: async (ctx, { alertId, by }) => {
    const alert = await ctx.db.get(alertId);
    if (!alert || alert.status === "resolved") return;
    await ctx.db.patch(alertId, {
      status: "resolved",
      acknowledgedBy: alert.acknowledgedBy ?? (by.trim().slice(0, 80) || "Care team"),
      acknowledgedAt: alert.acknowledgedAt ?? Date.now(),
    });
  },
});

/** Prompts the patient's hub or band should speak now, oldest first. */
export const pendingPrompts = query({
  args: { patientId: v.id("patients"), now: v.number() },
  handler: async (ctx, { patientId, now }) => {
    const open = await ctx.db
      .query("alerts")
      .withIndex("by_patient_status", (q) => q.eq("patientId", patientId).eq("status", "open"))
      .collect();
    return open
      .filter((a) => a.tier === "ask" && isPromptKind(a.kind) && !a.deliveredAt && now - a.createdAt <= PROMPT_TTL_MS)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((a) => ({ _id: a._id, kind: a.kind!, reason: a.reason, refId: a.refId, createdAt: a.createdAt }));
  },
});

/** The hub spoke a prompt. Dose reminders stay open until the dose is taken; others close. */
export const markDelivered = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, { alertId }) => {
    const alert = await ctx.db.get(alertId);
    if (!alert || alert.deliveredAt) return;
    const now = Date.now();
    const keepOpen = alert.kind === "dose_reminder" || alert.kind === "fall_check";
    await ctx.db.patch(alertId, keepOpen ? { deliveredAt: now } : { deliveredAt: now, status: "resolved", acknowledgedAt: now, acknowledgedBy: "Spoken by Cadence" });
  },
});
