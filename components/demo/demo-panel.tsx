"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AppShell, Panel } from "@/components/app/app-shell";
import { useNow } from "@/components/app/use-now";
import { useSelectedPatient } from "@/components/app/use-patient";
import { errorText } from "@/components/onboarding/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// /demo: the team's control panel. Every button goes through the same server
// code the devices use (convex/demo.ts → convex/doses.ts, safety.ts, devices.ts),
// so the demo works with the hardware unplugged.

type Tone = "default" | "danger" | "calm";

interface ActionDef {
  label: string;
  explain: string;
  tone?: Tone;
  confirm?: string;
  run: () => Promise<unknown>;
  describe?: (result: unknown) => string;
}

function ActionButton({ def }: { def: ActionDef }) {
  const [state, setState] = useState<{ kind: "idle" | "pending" | "ok" | "error"; text?: string }>({ kind: "idle" });

  async function go() {
    if (def.confirm && !confirm(def.confirm)) return;
    setState({ kind: "pending" });
    try {
      const result = await def.run();
      setState({ kind: "ok", text: def.describe ? def.describe(result) : "Done" });
    } catch (e: unknown) {
      setState({ kind: "error", text: errorText(e) });
    }
  }

  const tone =
    def.tone === "danger"
      ? "border-red-300 bg-red-50 hover:border-red-500"
      : def.tone === "calm"
        ? "border-emerald-300 bg-emerald-50 hover:border-emerald-500"
        : "border-plum/15 bg-white hover:border-violet";

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => void go()}
        disabled={state.kind === "pending"}
        className={`min-h-16 rounded-2xl border-2 px-4 py-3 text-left transition-colors disabled:opacity-60 ${tone}`}
      >
        <span className="block text-lg font-semibold">{state.kind === "pending" ? `${def.label}…` : def.label}</span>
        <span className="mt-1 block text-sm text-plum-muted">{def.explain}</span>
      </button>
      <p
        role="status"
        className={`min-h-5 px-1 pt-1 text-sm ${state.kind === "error" ? "text-destructive" : "text-emerald-700"}`}
      >
        {state.kind === "ok" || state.kind === "error" ? state.text : ""}
      </p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={title}>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </Panel>
  );
}

function counts(r: unknown): string {
  if (!r || typeof r !== "object") return "Done";
  const x = r as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof x.created === "number") parts.push(`${x.created} dose rows opened`);
  if (typeof x.reminders === "number") parts.push(`${x.reminders} reminders`);
  if (typeof x.missed === "number") parts.push(`${x.missed} marked missed`);
  if (typeof x.missedAlerts === "number") parts.push(`${x.missedAlerts} care alerts`);
  if (x.lowActivity) parts.push("low-activity nudge");
  return parts.length ? parts.join(" · ") : "Done";
}

export function DemoPanel() {
  const { patients, patient, select, loading } = useSelectedPatient();
  const resetDemo = useMutation(api.demo.resetDemo);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function load() {
    setResetting(true);
    setResetError(null);
    try {
      select(await resetDemo({}));
    } catch (e: unknown) {
      setResetError(errorText(e));
    } finally {
      setResetting(false);
    }
  }

  return (
    <AppShell patients={patients} patient={patient} onSelectPatient={select}>
      <div className="mb-6">
        <p className="mono-label text-plum-muted">Team only</p>
        <h1 className="font-display text-5xl leading-tight">Demo controls</h1>
        <p className="mt-2 max-w-prose text-plum-muted">
          Simulates every device event through the same server code the wristband and pillbox use. Keep{" "}
          <Link href="/hub" className="text-violet underline" target="_blank">
            /hub
          </Link>{" "}
          open in another tab: it speaks these prompts. Watch the results on{" "}
          <Link href="/care" className="text-violet underline" target="_blank">
            /care
          </Link>{" "}
          and{" "}
          <Link
            href={patient ? `/clinician/${patient._id}` : "/clinician"}
            className="text-violet underline"
            target="_blank"
          >
            the clinician report
          </Link>
          .
        </p>
      </div>
      {patient ? (
        <Controls patientId={patient._id} firstName={patient.firstName} isDemo={patient.isDemo} onReset={select} />
      ) : loading ? (
        <p className="text-plum-muted">Loading…</p>
      ) : (
        <div className="rounded-3xl border border-plum/10 bg-white/80 p-8">
          <h2 className="font-display text-3xl">No patient yet</h2>
          <p className="mt-2 text-plum-muted">Load Margaret, a simulated patient with two weeks of labeled history.</p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={resetting}
            className="mt-6 min-h-16 rounded-2xl bg-plum px-8 text-xl font-semibold text-white disabled:opacity-60"
          >
            {resetting ? "Loading demo patient…" : "Load demo patient"}
          </button>
          {resetError && <p className="mt-3 text-destructive">{resetError}</p>}
        </div>
      )}
    </AppShell>
  );
}

function Controls({
  patientId,
  firstName,
  isDemo,
  onReset,
}: {
  patientId: Id<"patients">;
  firstName: string;
  isDemo: boolean;
  onReset: (id: Id<"patients">) => void;
}) {
  const d = {
    lidOpen: useMutation(api.demo.lidOpen),
    doseDueNow: useMutation(api.demo.doseDueNow),
    missedDose: useMutation(api.demo.missedDose),
    fall: useMutation(api.demo.fall),
    sos: useMutation(api.demo.sos),
    activity: useMutation(api.demo.activity),
    checkIn: useMutation(api.demo.checkIn),
    deviceOffline: useMutation(api.demo.deviceOffline),
    deviceBack: useMutation(api.demo.deviceBack),
    tick: useMutation(api.demo.tick),
    resetDemo: useMutation(api.demo.resetDemo),
    imOkay: useMutation(api.safety.imOkay),
    needHelp: useMutation(api.safety.needHelp),
    summary: useAction(api.ai.requestDailySummary),
  };
  const p = { patientId };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Group title="Doses">
          <ActionButton
            def={{
              label: "Dose due now",
              explain: "Adds a demo medicine at this minute. Hub speaks a reminder; again at +15 min.",
              run: () => d.doseDueNow(p),
              describe: counts,
            }}
          />
          <ActionButton
            def={{
              label: "Pillbox lid opened",
              explain: "Logs the opening against the due dose; hub asks “did you take them?”. Again within 2 h warns of an extra opening.",
              run: () => d.lidOpen(p),
              describe: (r) => {
                const match = (r as { match?: string }).match;
                return match === "dose"
                  ? "Matched a dose: logged as opened"
                  : match === "extra"
                    ? "Extra opening: spoken warning and a care alert"
                    : "No dose in its window: logged only";
              },
            }}
          />
          <ActionButton
            def={{
              label: "Missed dose (skip ahead 31 min)",
              explain: "A dose whose window just closed after two reminders. Care partner gets “hasn't taken” alert.",
              run: () => d.missedDose(p),
              describe: (r) => `${counts(r)}${(r as { time?: string }).time ? ` · ${(r as { time: string }).time} dose` : ""}`,
            }}
          />
          <ActionButton
            def={{
              label: "Run dose engine now",
              explain: "The every-minute cron, right now: opens windows, sends reminders, marks misses.",
              run: () => d.tick(p),
              describe: counts,
            }}
          />
        </Group>

        <Group title="Safety">
          <ActionButton
            def={{
              label: "Possible fall",
              tone: "danger",
              explain: `Hub asks “${firstName}, are you okay?”. No answer in 30 s → urgent alert to the care team.`,
              run: () => d.fall(p),
              describe: () => "Fall logged; 30-second timer started",
            }}
          />
          <ActionButton
            def={{
              label: "SOS button",
              tone: "danger",
              explain: "Urgent alert immediately; hub tells them help is being contacted.",
              run: () => d.sos(p),
              describe: () => "Urgent alert raised",
            }}
          />
          <ActionButton
            def={{
              label: "Patient: I'm okay",
              tone: "calm",
              explain: "Cancels a pending fall alert (like the band button or saying “I'm fine”).",
              run: () => d.imOkay(p),
              describe: (r) => (r ? "Fall resolved: nobody alerted" : "No pending fall to cancel"),
            }}
          />
          <ActionButton
            def={{
              label: "Patient: I need help",
              tone: "danger",
              explain: "Urgent alert right away, with or without a fall.",
              run: () => d.needHelp(p),
              describe: () => "Urgent alert raised",
            }}
          />
        </Group>

        <Group title="Activity and check-ins">
          <ActionButton
            def={{
              label: "Short walk",
              explain: "One window of steps and heart rate from the band; shows on the care chart.",
              run: () => d.activity({ ...p, pattern: "walk" }),
              describe: () => "420 steps logged",
            }}
          />
          <ActionButton
            def={{
              label: "3 hours sitting still",
              explain: "Replaces the last 3 h with still windows. Hub gently suggests a short walk (8 AM–9 PM).",
              run: () => d.activity({ ...p, pattern: "still" }),
              describe: (r) =>
                (r as { lowActivity?: boolean }).lowActivity ? "Low-activity nudge queued for the hub" : "Logged; outside waking hours, no nudge",
            }}
          />
          <ActionButton
            def={{
              label: "Check-in: struggling",
              explain: "Press twice: two “struggling” check-ins in a row notify the care team.",
              run: () => d.checkIn({ ...p, state: "struggling", painScore: 7 }),
              describe: () => "Check-in saved (pain 7/10)",
            }}
          />
          <ActionButton
            def={{
              label: "Check-in: red flag",
              tone: "danger",
              explain: "Wound looks red and warm: notify-tier alert to the care team.",
              run: () => d.checkIn({ ...p, state: "sore_but_managing", painScore: 5, redFlag: true }),
              describe: () => "Red-flag check-in saved",
            }}
          />
        </Group>

        <Group title="Devices">
          <ActionButton
            def={{
              label: "Device offline 16 min",
              explain: "The simulated band stops checking in: “device offline” alert.",
              run: () => d.deviceOffline(p),
              describe: (r) => ((r as { raised?: number }).raised ? "Offline alert raised" : "Already flagged offline"),
            }}
          />
          <ActionButton
            def={{
              label: "Device back online",
              tone: "calm",
              explain: "A heartbeat arrives; the offline alert clears itself.",
              run: () => d.deviceBack(p),
              describe: () => "Band is back",
            }}
          />
        </Group>

        <Group title="Data">
          <ActionButton
            def={{
              label: "Write daily summary",
              explain: "Claude writes the 8 PM care-partner summary now (template if no API key).",
              run: () => d.summary(p),
              describe: (r) => {
                const model = (r as { model?: string }).model;
                return model === "template" ? "Saved (template; Claude unavailable)" : `Saved (written by ${model})`;
              },
            }}
          />
          <ActionButton
            def={{
              label: "Reset demo data",
              tone: "danger",
              confirm: "Delete the demo patient and rebuild two weeks of simulated history? Real patients are untouched.",
              explain: isDemo
                ? "Rebuilds Margaret with fresh simulated history. Only demo patients are deleted."
                : "This patient isn't a demo; resetting rebuilds only the demo patient.",
              run: async () => {
                const id = await d.resetDemo({});
                onReset(id);
                return id;
              },
              describe: () => "Fresh demo patient loaded",
            }}
          />
        </Group>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        <PendingFall patientId={patientId} />
        <HubPrompts patientId={patientId} />
        <Feed patientId={patientId} />
      </aside>
    </div>
  );
}

function PendingFall({ patientId }: { patientId: Id<"patients"> }) {
  const now = useNow(1000);
  // Query once per 10 s; the countdown itself ticks every second.
  const queryNow = now === null ? null : Math.floor(now / 10_000) * 10_000;
  const pending = useQuery(api.safety.pending, queryNow === null ? "skip" : { patientId, now: queryNow });
  if (!pending || now === null) return null;
  const left = Math.max(0, Math.ceil((pending.answerBy - now) / 1000));
  return (
    <div role="alert" className="rounded-3xl border-2 border-red-400 bg-red-50 p-5">
      <p className="mono-label text-red-800">Fall check pending</p>
      <p className="mt-2 font-display text-4xl text-red-900">{left > 0 ? `${left}s` : "Escalating…"}</p>
      <p className="mt-1 text-sm text-red-900">
        {left > 0 ? "until the care team gets an urgent alert. Press “I'm okay” to cancel." : "No answer: urgent alert sent."}
      </p>
    </div>
  );
}

function HubPrompts({ patientId }: { patientId: Id<"patients"> }) {
  const now = useNow(10_000);
  const prompts = useQuery(api.alerts.pendingPrompts, now === null ? "skip" : { patientId, now });
  return (
    <Panel title="Hub will say">
      {!prompts || prompts.length === 0 ? (
        <p className="text-sm text-plum-muted">Nothing queued. Open /hub to hear prompts as they arrive.</p>
      ) : (
        <ul className="space-y-2">
          {prompts.map((p) => (
            <li key={p._id} className="rounded-2xl bg-lilac px-3 py-2 text-sm">
              <span className="mono-label text-violet">{p.kind.replaceAll("_", " ")}</span>
              <span className="mt-1 block">{p.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Feed({ patientId }: { patientId: Id<"patients"> }) {
  const feed = useQuery(api.demo.feed, { patientId });
  return (
    <Panel title="Live feed">
      {feed === undefined ? (
        <p className="text-sm text-plum-muted">Loading…</p>
      ) : feed.length === 0 ? (
        <p className="text-sm text-plum-muted">Nothing yet.</p>
      ) : (
        <ol className="max-h-[60vh] space-y-2 overflow-y-auto pr-1" aria-live="polite">
          {feed.map((item) => (
            <li key={item.id} className="border-b border-plum/10 pb-2 text-sm last:border-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="mono-label text-violet">{item.label}</span>
                <span className="mono-label shrink-0 text-plum-muted">{item.time}</span>
              </div>
              {item.text && <p className="mt-0.5">{item.text}</p>}
              {item.status && <p className="text-xs text-plum-muted">{item.status}</p>}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
