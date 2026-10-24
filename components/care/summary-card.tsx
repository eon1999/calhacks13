"use client";

import { useAction } from "convex/react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/app/app-shell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDateTime } from "./chart-kit";
import type { CareData } from "./types";

export function modelNote(model: string): string {
  return model === "template" ? "written from a template (Claude not configured)" : `written by Claude (${model})`;
}

export function SummaryCard({
  patientId,
  summary,
  timeZone,
}: {
  patientId: Id<"patients">;
  summary: CareData["summary"];
  timeZone: string;
}) {
  const request = useAction(api.ai.requestDailySummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const write = async () => {
    setBusy(true);
    setError(null);
    try {
      await request({ patientId });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't write the summary");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Daily summary"
      action={
        <button
          onClick={write}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-plum/20 bg-white px-4 text-sm font-medium hover:bg-lilac disabled:opacity-60"
        >
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
          {busy ? "Writing…" : "Write today's summary now"}
        </button>
      }
    >
      {summary ? (
        <>
          <p className="text-lg leading-relaxed">{summary.body}</p>
          <p className="mt-3 text-sm text-plum-muted">
            {formatDateTime(timeZone, summary.createdAt)} · {modelNote(summary.model)}
          </p>
        </>
      ) : (
        <p className="text-plum-muted">No summary yet. One is written automatically at 8 PM, or write one now.</p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <p className="mt-3 text-xs text-plum-muted">
        Observations from what Cadence logged, not medical advice. Written automatically at 8 PM each evening.
      </p>
    </Panel>
  );
}
