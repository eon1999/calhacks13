"use client";

import { useMutation } from "convex/react";
import { TriangleAlert, BellRing, CircleCheck, Info } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/app/app-shell";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { formatDateTime } from "./chart-kit";
import { useAckName } from "./use-ack-name";

const QUICK_NOTES = ["I called her", "On my way", "Seen"];

const TIER_STYLE: Record<Doc<"alerts">["tier"], { box: string; label: string; icon: typeof TriangleAlert }> = {
  urgent: { box: "border-red-300 bg-red-50 text-red-950", label: "Urgent", icon: TriangleAlert },
  notify: { box: "border-amber-300 bg-amber-50 text-amber-950", label: "Needs a look", icon: BellRing },
  ask: { box: "border-violet/30 bg-violet/5 text-plum", label: "Worth a conversation", icon: Info },
  info: { box: "border-plum/10 bg-white text-plum", label: "For the record", icon: Info },
};

export function AlertList({
  open,
  handled,
  timeZone,
}: {
  open: Doc<"alerts">[];
  handled: Doc<"alerts">[];
  timeZone: string;
}) {
  const [name, setName] = useAckName();
  const [editing, setEditing] = useState(false);

  return (
    <Panel
      title={open.length ? `Needs attention · ${open.length}` : "Alerts"}
      action={
        <span className="text-sm text-plum-muted">
          Acknowledging as{" "}
          {editing ? (
            <input
              autoFocus
              defaultValue={name}
              aria-label="Your name"
              className="h-9 w-32 rounded-full border border-plum/20 px-3 text-plum"
              onBlur={(e) => {
                setName(e.target.value);
                setEditing(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <button className="font-semibold text-violet underline" onClick={() => setEditing(true)}>
              {name}
            </button>
          )}
        </span>
      }
    >
      {open.length === 0 ? (
        <p className="flex items-center gap-2 text-lg">
          <CircleCheck aria-hidden className="size-6 text-[#0ca30c]" /> All clear. Nothing needs you right now.
        </p>
      ) : (
        <ul className="space-y-3">
          {open.map((a) => (
            <OpenAlert key={a._id} alert={a} timeZone={timeZone} by={name} />
          ))}
        </ul>
      )}

      {handled.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-medium text-plum-muted">
            Handled in the last day ({handled.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {handled.map((a) => (
              <li key={a._id} className="rounded-2xl border border-plum/10 bg-white px-4 py-3 text-sm">
                <p>{a.reason}</p>
                <p className="mt-1 text-plum-muted">
                  {formatDateTime(timeZone, a.createdAt)} · {a.status}
                  {a.acknowledgedBy ? ` by ${a.acknowledgedBy}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

function OpenAlert({ alert, timeZone, by }: { alert: Doc<"alerts">; timeZone: string; by: string }) {
  const acknowledge = useMutation(api.alerts.acknowledge);
  const [busy, setBusy] = useState(false);
  const style = TIER_STYLE[alert.tier];
  const Icon = style.icon;

  const ack = async (note?: string) => {
    setBusy(true);
    try {
      await acknowledge({ alertId: alert._id as Id<"alerts">, by, note });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`rounded-2xl border-2 p-4 ${style.box}`} role={alert.tier === "urgent" ? "alert" : undefined}>
      <div className="flex items-start gap-3">
        <Icon aria-hidden className="mt-1 size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="mono-label">
            {style.label} · {formatDateTime(timeZone, alert.createdAt)}
          </p>
          <p className="mt-1 text-lg leading-snug font-medium">{alert.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_NOTES.map((note) => (
              <button
                key={note}
                disabled={busy}
                onClick={() => ack(note)}
                className="min-h-11 rounded-full bg-plum px-4 text-sm font-medium text-white hover:bg-plum/85 disabled:opacity-50"
              >
                {note}
              </button>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}
