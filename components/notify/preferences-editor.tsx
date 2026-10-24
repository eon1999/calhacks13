"use client";

import { useState } from "react";
import { ChoiceCard, Toggle } from "@/components/onboarding/ui";
import {
  applyPreset,
  DEFAULT_QUIET_HOURS,
  formatClock,
  formatQuietHours,
  PREFERENCE_COPY,
  PRESET_ORDER,
  PRESETS,
  presetOf,
  urgentOffWarning,
  type NotificationPreferences,
} from "@/lib/notify/preferences";

interface PreferencesEditorProps {
  preferences: NotificationPreferences;
  onChange: (next: NotificationPreferences) => void;
  patientName: string;
  /** Only the owner ever gets "please check in" requests. */
  isOwner: boolean;
  /** Caregivers don't get the daily summary unless the owner gives them it. */
  hasSummaryPermission: boolean;
  disabled?: boolean;
  /** "you" or the member's name, for the copy. */
  who?: string;
}

const timeInput =
  "h-9 rounded-xl border border-plum/15 bg-white/70 px-2 text-sm text-plum outline-none focus:border-violet disabled:opacity-50";

/**
 * Three presets up front; the individual switches live under "Customize" so
 * most people never need them. Changes save as soon as they're made.
 */
export function PreferencesEditor({
  preferences,
  onChange,
  patientName,
  isOwner,
  hasSummaryPermission,
  disabled,
  who = "you",
}: PreferencesEditorProps) {
  const preset = presetOf(preferences);
  const [customizing, setCustomizing] = useState(preset === "custom");
  const set = (patch: Partial<NotificationPreferences>) => onChange({ ...preferences, ...patch });

  return (
    <div className="space-y-4 text-plum">
      <div role="radiogroup" aria-label="How much should Cadence text?" className="grid gap-2">
        {PRESET_ORDER.map((id) => (
          <ChoiceCard
            key={id}
            selected={preset === id}
            onSelect={() => !disabled && onChange(applyPreset(preferences, id))}
            title={`${PRESETS[id].title}${id === "important" ? " (recommended)" : ""}`}
            body={PRESETS[id].body}
          />
        ))}
        {preset === "custom" && (
          <p className="px-1 text-sm text-plum-muted">Custom: {who === "you" ? "you've" : `${who} has`} picked the switches below.</p>
        )}
      </div>

      {!preferences.urgent && <UrgentWarning patientName={patientName} />}

      <div className="rounded-2xl border border-plum/10 bg-white/30">
        <button
          type="button"
          aria-expanded={customizing}
          onClick={() => setCustomizing((v) => !v)}
          className="mono-label flex w-full items-center justify-between px-4 py-3 text-plum-muted hover:text-violet"
        >
          Customize
          <span aria-hidden>{customizing ? "−" : "+"}</span>
        </button>
        {customizing && (
          <div className="space-y-2 px-3 pb-3">
            <Toggle
              checked={preferences.urgent}
              onChange={(urgent) => !disabled && set({ urgent })}
              label={PREFERENCE_COPY.urgent.label}
              body={PREFERENCE_COPY.urgent.body}
            />
            <Toggle
              checked={preferences.headsUps}
              onChange={(headsUps) => !disabled && set({ headsUps })}
              label={PREFERENCE_COPY.headsUps.label}
              body={PREFERENCE_COPY.headsUps.body}
            />
            {isOwner && (
              <Toggle
                checked={preferences.askAlerts}
                onChange={(askAlerts) => !disabled && set({ askAlerts })}
                label={PREFERENCE_COPY.askAlerts.label}
                body={PREFERENCE_COPY.askAlerts.body}
              />
            )}
            {hasSummaryPermission ? (
              <>
                <Toggle
                  checked={preferences.dailySummary}
                  onChange={(dailySummary) => !disabled && set({ dailySummary })}
                  label={PREFERENCE_COPY.dailySummary.label}
                  body={PREFERENCE_COPY.dailySummary.body}
                />
                {preferences.dailySummary && (
                  <label className="flex items-center gap-3 px-4 text-sm">
                    <span className="text-plum-muted">Send it at</span>
                    <input
                      type="time"
                      value={preferences.summaryTime}
                      disabled={disabled}
                      onChange={(e) => e.target.value && set({ summaryTime: e.target.value })}
                      className={timeInput}
                    />
                    <span className="text-plum-muted">({formatClock(preferences.summaryTime)}, {patientName}&apos;s time)</span>
                  </label>
                )}
              </>
            ) : (
              <p className="px-4 py-1 text-sm text-plum-muted">
                Daily summaries go to family. The person who set Cadence up can add one for caregivers.
              </p>
            )}
            <Toggle
              checked={preferences.quietHours !== null}
              onChange={(on) => !disabled && set({ quietHours: on ? DEFAULT_QUIET_HOURS : null })}
              label={PREFERENCE_COPY.quietHours.label}
              body={PREFERENCE_COPY.quietHours.body}
            />
            {preferences.quietHours && (
              <div className="flex flex-wrap items-center gap-2 px-4 text-sm">
                <span className="text-plum-muted">From</span>
                <input
                  type="time"
                  aria-label="Quiet hours start"
                  value={preferences.quietHours.start}
                  disabled={disabled}
                  onChange={(e) =>
                    e.target.value &&
                    e.target.value !== preferences.quietHours!.end &&
                    set({ quietHours: { ...preferences.quietHours!, start: e.target.value } })
                  }
                  className={timeInput}
                />
                <span className="text-plum-muted">to</span>
                <input
                  type="time"
                  aria-label="Quiet hours end"
                  value={preferences.quietHours.end}
                  disabled={disabled}
                  onChange={(e) =>
                    e.target.value &&
                    e.target.value !== preferences.quietHours!.start &&
                    set({ quietHours: { ...preferences.quietHours!, end: e.target.value } })
                  }
                  className={timeInput}
                />
                <span className="text-plum-muted">({formatQuietHours(preferences.quietHours)})</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function UrgentWarning({ patientName }: { patientName: string }) {
  return (
    <p role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
      <strong>Urgent alerts are off.</strong> {urgentOffWarning(patientName)}
    </p>
  );
}
