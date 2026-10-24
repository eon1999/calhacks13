"use client";

import { useState, type ReactNode } from "react";
import {
  Activity,
  Bug,
  Footprints,
  HeartPulse,
  Megaphone,
  Pill,
  PillBottle,
  RefreshCw,
  Siren,
  Trash2,
  TriangleAlert,
  Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EVENT_LABELS, type WearableEvent } from "@/lib/voice/events";
import { FamilyTextsSection } from "./family-texts-section";
import { useDebugActivity, type DebugActivity } from "./use-debug-activity";
import type { useVoiceAgent } from "./use-voice-agent";
import { cardTitle, field, sectionLabel } from "./styles";

type Agent = ReturnType<typeof useVoiceAgent>;

interface DebugPanelProps {
  agent: Agent;
  busy: boolean;
}

const EVENT_BUTTONS: { event: WearableEvent; icon: ReactNode; danger?: boolean }[] = [
  { event: "dose_due", icon: <Pill /> },
  { event: "missed_dose", icon: <PillBottle /> },
  { event: "check_in", icon: <HeartPulse /> },
  { event: "low_activity", icon: <Footprints /> },
  { event: "fall", icon: <TriangleAlert />, danger: true },
  { event: "sos", icon: <Siren />, danger: true },
];

// One-tap patient utterances, so testers can exercise the agent without a mic.
const QUICK_PHRASES = [
  "I just took my pills.",
  "What's my next medication?",
  "Did I take my noon dose?",
  "My knee is really throbbing, maybe a 7 out of 10.",
  "The wound looks red and it feels warm.",
  "I'm doing great, thanks!",
  "I fell and I can't get up.",
];

const DEFAULT_TEST_MESSAGE = "Hi, this is a test of your Cadence wristband. Can you hear me clearly?";

function timeAgo(at: number): string {
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className={sectionLabel}>{title}</p>
      {children}
    </div>
  );
}

interface ActivityFeedProps {
  activity: DebugActivity | null;
  error: string | null;
  refresh: () => Promise<void>;
}

function ActivityFeed({ activity, error, refresh }: ActivityFeedProps) {
  const rows = activity
    ? [
        ...activity.alerts.map((a) => ({
          id: a._id,
          at: a.createdAt,
          kind: `alert · ${a.tier}`,
          text: a.reason,
          danger: a.tier === "urgent",
        })),
        ...activity.checkIns.map((c) => ({
          id: c._id,
          at: c.at,
          kind: `check-in · ${c.trigger}`,
          text: `${c.state.replace("_", " ")}${c.notes ? ` — ${c.notes}` : ""}${c.redFlag ? " (red flag)" : ""}`,
          danger: c.redFlag,
        })),
        ...activity.events.map((e) => ({
          id: e._id,
          at: e.at,
          kind: `device · ${e.type}`,
          text: EVENT_LABELS[e.type as WearableEvent] ?? e.type,
          danger: true,
        })),
        ...activity.doseEvents.map((d) => ({
          id: d._id,
          at: d.confirmedAt ?? d.scheduledFor,
          kind: `dose · ${d.status}`,
          text: `via ${d.source ?? "unknown"}`,
          danger: false,
        })),
      ].sort((a, b) => b.at - a.at)
    : [];

  return (
    <Section title="What the agent wrote">
      <div className="flex justify-end">
        <Button variant="ghost" size="xs" onClick={() => void refresh()}>
          <RefreshCw /> Refresh
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {rows.length === 0 && !error && (
        <p className="text-xs text-muted-foreground">Nothing yet. Alerts, check-ins and doses show up here.</p>
      )}
      <ul className="max-h-56 space-y-1.5 overflow-y-auto">
        {rows.map((row) => (
          <li key={row.id} className="text-xs">
            <Badge variant={row.danger ? "destructive" : "secondary"} className="mr-1.5">
              {row.kind}
            </Badge>
            {row.text} <span className="text-muted-foreground">· {timeAgo(row.at)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Tester controls: fire wearable events, text the family, canned speech, TTS test, and data reset. */
export function DebugPanel({ agent, busy }: DebugPanelProps) {
  const [message, setMessage] = useState(DEFAULT_TEST_MESSAGE);
  const feed = useDebugActivity(agent.patient?.id, agent.log.length);

  function confirmReset() {
    if (window.confirm("Clear today's doses, check-ins, alerts and voice history for this patient?")) {
      void agent.resetToday();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className={cardTitle}>
          <Bug className="size-4" /> Debug tools
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Section title="Trigger wearable event">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {EVENT_BUTTONS.map(({ event, icon, danger }) => (
              <Button
                key={event}
                variant={danger ? "destructive" : "outline"}
                disabled={busy}
                className="h-auto min-h-8 justify-start py-1.5 text-left whitespace-normal"
                onClick={() => void agent.nudge(event)}
              >
                {icon} {EVENT_LABELS[event]}
              </Button>
            ))}
          </div>
        </Section>

        {agent.patient && (
          <Section title="Text the family">
            <FamilyTextsSection
              patientId={agent.patient.id}
              patientName={agent.patient.preferredName ?? agent.patient.name}
              activity={feed.activity}
              refresh={feed.refresh}
            />
          </Section>
        )}

        <Section title="Patient says">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PHRASES.map((phrase) => (
              <Button
                key={phrase}
                variant="secondary"
                size="xs"
                disabled={busy}
                onClick={() => void agent.sendTurn({ text: phrase })}
              >
                <Megaphone /> {phrase}
              </Button>
            ))}
          </div>
        </Section>

        <Section title="Test voice message (speaker only, no AI)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={2}
            className={`${field} w-full py-2`}
          />
          <Button
            variant="outline"
            disabled={busy || !message.trim()}
            onClick={() => void agent.testVoiceMessage(message.trim())}
          >
            <Volume2 /> Play on wearable
          </Button>
        </Section>

        <ActivityFeed activity={feed.activity} error={feed.error} refresh={feed.refresh} />

        <Section title="Settings">
          <label className="flex items-center gap-2 text-sm text-plum">
            <input
              type="checkbox"
              checked={agent.autoReminders}
              onChange={(e) => agent.setAutoReminders(e.target.checked)}
              className="accent-violet"
            />
            <Activity className="size-4" /> Auto-remind when a dose is due (polls every 30s)
          </label>
          <Button variant="destructive" size="sm" disabled={busy} onClick={confirmReset}>
            <Trash2 /> Reset today&apos;s data
          </Button>
        </Section>
      </CardContent>
    </Card>
  );
}
