"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useNow } from "@/components/app/use-now";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * "Are you okay?" after a possible fall: two big buttons, and how long until
 * the care team is alerted. Also the hub's always-there "I need help" button.
 */
export function SafetyCard({ patientId }: { patientId?: string }) {
  const id = patientId as Id<"patients"> | undefined;
  const now = useNow(1_000);
  const pending = useQuery(api.safety.pending, id && now !== null ? { patientId: id, now } : "skip");
  const imOkay = useMutation(api.safety.imOkay);
  const needHelp = useMutation(api.safety.needHelp);
  const [sent, setSent] = useState<"ok" | "help" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!id) return null;

  async function send(kind: "ok" | "help") {
    setError(null);
    try {
      if (kind === "ok") await imOkay({ patientId: id! });
      else await needHelp({ patientId: id! });
      setSent(kind);
      setTimeout(() => setSent(null), 8_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that");
    }
  }

  const secondsLeft = pending && now !== null ? Math.max(0, Math.ceil((pending.answerBy - now) / 1000)) : null;

  return (
    <section
      aria-live="assertive"
      className={`rounded-3xl p-5 text-white shadow-xl ${pending ? "bg-red-700" : "bg-[#2a0f5c]/80 backdrop-blur"}`}
    >
      {pending ? (
        <>
          <h2 className="text-3xl font-semibold">Are you okay?</h2>
          <p className="mt-2 text-xl">
            The band felt a possible fall.{" "}
            {secondsLeft ? `Your care team will be told in ${secondsLeft} seconds unless you answer.` : "Telling your care team now."}
          </p>
        </>
      ) : (
        <p className="text-xl">{sent === "ok" ? "Thanks. Nobody was alerted." : sent === "help" ? "Your care team is being contacted. If you're hurt, call 911." : "Need someone? Press for help."}</p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {pending && (
          <button
            type="button"
            onClick={() => void send("ok")}
            className="min-h-16 rounded-2xl bg-white px-6 text-2xl font-semibold text-plum focus-visible:ring-4 focus-visible:ring-white/60 outline-none"
          >
            I&apos;m okay
          </button>
        )}
        <button
          type="button"
          onClick={() => void send("help")}
          className={`min-h-16 rounded-2xl px-6 text-2xl font-semibold outline-none focus-visible:ring-4 focus-visible:ring-white/60 ${pending ? "bg-black/30 text-white" : "bg-red-600 text-white"}`}
        >
          I need help
        </button>
      </div>
      {error && <p className="mt-3 text-lg">{error}</p>}
    </section>
  );
}
