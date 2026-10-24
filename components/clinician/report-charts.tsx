"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_TICK,
  ChartFrame,
  EmptyChart,
  formatDateTime,
  INK,
  LegendRow,
  SERIES,
  shortDate,
  tooltipStyle,
} from "@/components/care/chart-kit";
import { doseOutcome } from "@/lib/reports/stats";
import type { ClinicianData } from "./types";

/** Pain scores over time, with taken doses as a marker row along the bottom. */
export function PainOverTime({ data }: { data: ClinicianData }) {
  const tz = data.patient.timeZone;
  const points = data.stats.pain.points.map((p) => ({ at: p.at, score: p.score }));
  if (!points.length) return <EmptyChart>No pain scores in this period.</EmptyChart>;
  const doses = [
    ...new Set(
      data.evidence.doses
        .filter((d) => ["on_time", "late"].includes(doseOutcome(d)))
        .map((d) => d.confirmedAt ?? d.openedAt ?? d.scheduledFor),
    ),
  ].map((at) => ({ at, score: -0.6 }));
  const { from, to } = data.range;
  const dayTick = (at: number) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(at));

  return (
    <>
      <LegendRow
        items={[
          { color: SERIES.blue, label: "Pain score (0–10)" },
          { color: SERIES.aqua, label: "Dose taken" },
        ]}
      />
      <ChartFrame label="Pain scores over time with dose times" height={240}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={INK.grid} vertical={false} />
            <XAxis
              type="number"
              dataKey="at"
              domain={[from, to]}
              scale="time"
              tickFormatter={dayTick}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: INK.grid }}
              tickCount={7}
            />
            <YAxis
              type="number"
              dataKey="score"
              domain={[-1, 10]}
              ticks={[0, 2, 4, 6, 8, 10]}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ stroke: INK.grid }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as { at: number; score: number } | undefined;
                if (!active || !p) return null;
                return (
                  <div style={tooltipStyle.contentStyle} className="bg-white px-3 py-2">
                    <p className="font-semibold">{formatDateTime(tz, p.at)}</p>
                    <p>{p.score < 0 ? "Dose taken" : `Pain ${p.score}/10`}</p>
                  </div>
                );
              }}
            />
            <Scatter name="Dose taken" data={doses} fill={SERIES.aqua} shape="triangle" isAnimationActive={false} />
            <Scatter name="Pain" data={points} fill={SERIES.blue} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartFrame>
    </>
  );
}

/** Average pain by hours since the last dose taken. */
export function PainSinceDose({ data }: { data: ClinicianData }) {
  const buckets = data.stats.pain.bySinceDose.map((b) => ({ ...b, average: b.average ?? 0, label: `${b.bucket} (n=${b.n})` }));
  if (buckets.every((b) => b.n === 0)) return <EmptyChart>Not enough pain scores to compare.</EmptyChart>;
  return (
    <ChartFrame label="Average pain by hours since last dose" height={220}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={INK.grid} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.grid }} />
          <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "rgb(144 71 255 / 0.08)" }} formatter={(v) => [`${v}/10`, "Average pain"]} />
          <Bar dataKey="average" name="Average pain" fill={SERIES.blue} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Steps per day, and average heart rate per day as its own chart (one axis each). */
export function ActivityByDay({ data }: { data: ClinicianData }) {
  const days = data.stats.days.map((d) => ({ ...d, label: shortDate(d.date) }));
  const hasSteps = days.some((d) => d.steps > 0);
  const hasHr = days.some((d) => d.avgHeartRate !== null);
  if (!hasSteps && !hasHr) return <EmptyChart>No wristband data in this period.</EmptyChart>;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {hasSteps && (
        <div>
          <p className="mb-1 text-sm font-medium">Steps per day</p>
          <ChartFrame label="Steps per day" height={200}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.grid }} minTickGap={8} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "rgb(144 71 255 / 0.08)" }} formatter={(v) => [Number(v).toLocaleString("en-US"), "Steps"]} />
                <Bar dataKey="steps" fill={SERIES.blue} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      )}
      {hasHr && (
        <div>
          <p className="mb-1 text-sm font-medium">Average heart rate (bpm)</p>
          <ChartFrame label="Average heart rate per day" height={200}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={days} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.grid }} minTickGap={8} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} domain={["dataMin - 5", "dataMax + 5"]} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v} bpm`, "Heart rate"]} />
                <Line dataKey="avgHeartRate" stroke={SERIES.aqua} strokeWidth={2} dot={{ r: 4, fill: SERIES.aqua, stroke: "#fff", strokeWidth: 2 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      )}
    </div>
  );
}
