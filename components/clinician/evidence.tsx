"use client";

import { createContext, useContext, type ReactNode } from "react";
import { formatDateTime } from "@/components/care/chart-kit";
import { doseOutcome } from "@/lib/reports/stats";
import type { ClinicianData } from "./types";

// Evidence citations: every id a pattern or observation cites gets a number,
// shown as a chip that links to its row in the appendix.

const EvidenceContext = createContext<Map<string, number>>(new Map());

export function EvidenceProvider({ order, children }: { order: string[]; children: ReactNode }) {
  return <EvidenceContext.Provider value={new Map(order.map((id, i) => [id, i + 1]))}>{children}</EvidenceContext.Provider>;
}

export function EvidenceChips({ ids }: { ids: string[] }) {
  const index = useContext(EvidenceContext);
  if (!ids.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => {
        const n = index.get(id);
        if (!n) return null;
        return (
          <a
            key={id}
            href={`#ev-${id}`}
            aria-label={`Evidence ${n}`}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-violet/40 bg-violet/10 px-1.5 text-[11px] font-semibold text-violet-deep tabular-nums hover:bg-violet/20"
          >
            {n}
          </a>
        );
      })}
    </span>
  );
}

const OUTCOME_LABEL = { on_time: "Taken on time", late: "Taken late", missed: "Missed", pending: "Due", extra: "Extra opening" };
const STATE_LABEL: Record<string, string> = {
  doing_well: "Doing well",
  sore_but_managing: "Sore but managing",
  struggling: "Struggling",
  unsure: "Unsure",
};

interface Row {
  id: string;
  at: number;
  type: string;
  detail: string;
}

export function evidenceRows(data: ClinicianData): Map<string, Row> {
  const tz = data.patient.timeZone;
  const rows = new Map<string, Row>();
  for (const d of data.evidence.doses) {
    const outcome = doseOutcome(d);
    const at = d.confirmedAt ?? d.openedAt;
    rows.set(d.id, {
      id: d.id,
      at: d.scheduledFor,
      type: "Dose",
      detail: `${d.medicationName}: ${OUTCOME_LABEL[outcome]}${at && outcome !== "missed" ? ` (${formatDateTime(tz, at)})` : ""}`,
    });
  }
  for (const c of data.evidence.checkIns) {
    rows.set(c.id, {
      id: c.id,
      at: c.at,
      type: c.redFlag ? "Check-in (warning sign)" : "Check-in",
      detail: `${STATE_LABEL[c.state] ?? c.state}${c.painScore !== undefined ? `, pain ${c.painScore}/10` : ""}. ${c.notes ?? `“${c.transcript}”`}`,
    });
  }
  for (const e of data.evidence.events) {
    rows.set(e.id, {
      id: e.id,
      at: e.at,
      type: e.type === "fall" ? "Possible fall" : e.type === "sos" ? "SOS" : "Device offline",
      detail: e.resolution ? `Resolution: ${e.resolution}` : "",
    });
  }
  return rows;
}

export function EvidenceAppendix({ order, data }: { order: string[]; data: ClinicianData }) {
  const rows = evidenceRows(data);
  const cited = order.map((id, i) => ({ n: i + 1, row: rows.get(id) })).filter((x) => x.row);
  if (!cited.length) return <p className="text-plum-muted">No rows cited yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="mono-label text-plum-muted">
          <tr className="border-b border-plum/10">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">When</th>
            <th className="py-2 pr-3">Type</th>
            <th className="py-2">Details</th>
          </tr>
        </thead>
        <tbody>
          {cited.map(({ n, row }) => (
            <tr key={row!.id} id={`ev-${row!.id}`} className="scroll-mt-24 border-b border-plum/5 target:bg-violet/10">
              <td className="py-2 pr-3 font-semibold tabular-nums">{n}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(data.patient.timeZone, row!.at)}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{row!.type}</td>
              <td className="py-2">{row!.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
