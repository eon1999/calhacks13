"use client";

import { useNow } from "@/components/app/use-now";
import { formatLocalTime } from "@/lib/schedule";
import type { useVoiceAgent } from "./use-voice-agent";

type Agent = ReturnType<typeof useVoiceAgent>;

/**
 * The hub's patient-facing face: a big clock, the next dose, a caption of what
 * Cadence last said, and large Yes / No buttons for anyone who'd rather not
 * talk (tremor or pain makes small controls hard). Text ≥ 24px, buttons ≥ 64px.
 */
export function HubNowCard({ agent }: { agent: Agent }) {
  const now = useNow(10_000);
  const patient = agent.patient;
  if (!patient || now === null) return null;

  const next = agent.slots.find((s) => s.status === "due") ?? agent.slots.find((s) => s.status === "upcoming");
  const sameTime = next ? agent.slots.filter((s) => s.scheduledFor === next.scheduledFor && s.status !== "taken") : [];
  const caption = [...agent.log].reverse().find((e) => e.who === "cadence")?.text;
  const busy = agent.status === "thinking" || agent.status === "speaking" || agent.status === "listening";

  return (
    <section className="rounded-3xl bg-white/95 p-6 text-plum shadow-xl" aria-label="Right now">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="font-display text-6xl leading-none md:text-7xl">{formatLocalTime(patient.timeZone, now)}</p>
        {next ? (
          <div className={`rounded-2xl px-5 py-3 ${next.status === "due" ? "bg-blue-600 text-white" : "bg-lilac"}`}>
            <p className="text-lg">{next.status === "due" ? "Time for your medicine" : "Next medicine"}</p>
            <p className="text-2xl font-semibold">
              {formatLocalTime(patient.timeZone, next.scheduledFor)} · {sameTime.map((s) => s.name).join(", ")}
            </p>
          </div>
        ) : (
          <p className="rounded-2xl bg-green-100 px-5 py-3 text-2xl text-green-900">All of today&apos;s medicines are done</p>
        )}
      </div>

      <p aria-live="polite" className="mt-5 min-h-[2.5em] text-2xl leading-snug md:text-3xl">
        {agent.status === "thinking" ? "…" : (caption ?? `Hello ${patient.name.split(" ")[0]}. Tap the button below to talk to me.`)}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void agent.sendTurn({ text: "Yes" })}
          className="min-h-16 rounded-2xl bg-green-700 text-3xl font-semibold text-white outline-none focus-visible:ring-4 focus-visible:ring-green-300 disabled:opacity-50"
        >
          Yes
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void agent.sendTurn({ text: "No" })}
          className="min-h-16 rounded-2xl bg-plum text-3xl font-semibold text-white outline-none focus-visible:ring-4 focus-visible:ring-violet/40 disabled:opacity-50"
        >
          No
        </button>
      </div>
    </section>
  );
}
