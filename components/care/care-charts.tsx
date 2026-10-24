"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayRow } from "@/lib/reports/stats";
import { AXIS_TICK, ChartFrame, EmptyChart, formatTime, INK, LegendRow, SERIES, shortDate, STATUS, tooltipStyle } from "./chart-kit";
import type { CareData } from "./types";

/** Steps per window today; heart rate in its own small chart (never a second y-axis). */
export function ActivityToday({ activity, timeZone }: { activity: CareData["activity"]; timeZone: string }) {
  if (activity.length === 0) return <EmptyChart>No movement data from the band yet today.</EmptyChart>;
  const data = activity.map((a) => ({ time: formatTime(timeZone, a.at), steps: a.steps, heartRate: a.heartRate }));
  const hasHr = data.some((d) => d.heartRate !== null);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-sm font-medium">Steps</p>
        <ChartFrame label="Steps per window today" height={180}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke={INK.grid} />
              <XAxis dataKey="time" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.grid }} minTickGap={24} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "rgb(144 71 255 / 0.08)" }} />
              <Bar dataKey="steps" name="Steps" fill={SERIES.blue} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>
      {hasHr && (
        <div>
          <p className="mb-1 text-sm font-medium">Heart rate (bpm)</p>
          <ChartFrame label="Heart rate today" height={140}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="time" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.grid }} minTickGap={24} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} domain={["dataMin - 5", "dataMax + 5"]} width={44} />
                <Tooltip {...tooltipStyle} />
                <Line dataKey="heartRate" name="Heart rate" stroke={SERIES.aqua} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      )}
    </div>
  );
}

/** Doses per day, stacked: on time / late / missed. */
export function AdherenceByDay({ days, height = 200 }: { days: DayRow[]; height?: number }) {
  if (days.every((d) => d.onTime + d.late + d.missed === 0)) return <EmptyChart>No doses closed in this period.</EmptyChart>;
  const data = days.map((d) => ({ ...d, label: shortDate(d.date) }));
  return (
    <>
      <LegendRow
        items={[
          { color: STATUS.good, label: "On time" },
          { color: STATUS.warning, label: "Late" },
          { color: STATUS.critical, label: "Missed" },
        ]}
      />
      <ChartFrame label="Doses per day: on time, late, missed" height={height}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={INK.grid} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.grid }} minTickGap={8} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
            <Tooltip {...tooltipStyle} cursor={{ fill: "rgb(144 71 255 / 0.08)" }} />
            <Bar dataKey="onTime" name="On time" stackId="d" fill={STATUS.good} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="late" name="Late" stackId="d" fill={STATUS.warning} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="missed" name="Missed" stackId="d" fill={STATUS.critical} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    </>
  );
}
