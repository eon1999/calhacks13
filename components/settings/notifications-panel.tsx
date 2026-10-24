"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { Panel } from "@/components/app/app-shell";
import { PreferencesEditor } from "@/components/notify/preferences-editor";
import { ErrorNote, errorText, SecondaryButton, TextButton, TextInput } from "@/components/onboarding/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toE164 } from "@/lib/notify/phone";
import { describePreferences, teamUrgentGapWarning, type NotificationPreferences } from "@/lib/notify/preferences";

/**
 * Who gets texted, and how much. Each person picks a preset (most never need
 * more); the owner or patient can set anyone's, everyone else only their own.
 */
export function NotificationsPanel({ userId, patientId }: { userId: string; patientId: Id<"patients"> }) {
  const overview = useQuery(api.notify.overview, { userId, patientId });
  const setPrefs = useMutation(api.notify.setNotificationPreferences);
  const setPhone = useMutation(api.notify.setMemberPhone);
  const sendTest = useAction(api.notify.sendTestText);
  const sendSummary = useAction(api.summary.sendSummaryNow);
  const [open, setOpen] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      setNote(await task());
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const savePrefs = (memberId: Id<"careTeamMembers">, preferences: NotificationPreferences) =>
    void run(async () => {
      await setPrefs({ userId, memberId, preferences });
      return null;
    });

  function savePhone(e: FormEvent, memberId: Id<"careTeamMembers">) {
    e.preventDefault();
    void run(async () => {
      await setPhone({ userId, memberId, phone: draft });
      setEditingPhone(null);
      return null;
    });
  }

  const action = overview && (
    <span className="mono-label text-plum-muted">{overview.live ? "Texting is live" : "Dry run: texts are logged, not sent"}</span>
  );

  return (
    <Panel title="Text notifications" action={action}>
      {overview === undefined && <p className="text-plum-muted">Loading…</p>}
      {overview === null && (
        <p className="text-plum-muted">Only people on this care team can see who gets texts.</p>
      )}
      {overview && (
        <div className="space-y-4">
          {overview.urgentGap && (
            <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <strong>No one gets urgent texts.</strong> {teamUrgentGapWarning(overview.patientName)}
            </p>
          )}
          {overview.recipients.length === 0 && <p className="text-plum-muted">No family or caregivers on the team yet.</p>}

          <ul className="divide-y divide-plum/10">
            {overview.recipients.map((r) => (
              <li key={r.memberId} className="space-y-3 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">
                    {r.name}
                    {r.isMe && " (you)"}
                  </span>
                  <span className="font-mono text-sm text-plum-muted">{r.phone ?? "no mobile number"}</span>
                  <span className="text-sm text-plum-muted">· {describePreferences(r.preferences)}</span>
                  {!r.preferences.urgent && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-950">no urgent texts</span>
                  )}
                  <span className="ml-auto flex flex-wrap gap-1">
                    {r.canEdit && (
                      <TextButton type="button" onClick={() => setOpen(open === r.memberId ? null : r.memberId)}>
                        {open === r.memberId ? "Done" : "Change"}
                      </TextButton>
                    )}
                    {r.phone && (
                      <TextButton
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const res = await sendTest({ userId, memberId: r.memberId });
                            return res.status === "sent" ? `Test text sent to ${r.name}.` : `Not sent: ${res.reason}`;
                          })
                        }
                      >
                        Send test
                      </TextButton>
                    )}
                  </span>
                </div>

                {open === r.memberId && (
                  <div className="space-y-4 rounded-2xl bg-lilac/70 p-4">
                    {editingPhone === r.memberId ? (
                      <form onSubmit={(e) => savePhone(e, r.memberId)} className="flex flex-wrap items-center gap-2">
                        <TextInput
                          type="tel"
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder="(415) 555-0123"
                          aria-label={`Mobile number for ${r.name}`}
                          className="max-w-xs"
                        />
                        <SecondaryButton type="submit" disabled={busy || (!!draft.trim() && !toE164(draft))}>
                          {draft.trim() ? "Save number" : "Remove number"}
                        </SecondaryButton>
                        <TextButton type="button" onClick={() => setEditingPhone(null)}>
                          Cancel
                        </TextButton>
                      </form>
                    ) : (
                      <TextButton
                        type="button"
                        className="px-0"
                        onClick={() => {
                          setEditingPhone(r.memberId);
                          setDraft("");
                        }}
                      >
                        {r.phone ? "Change mobile number" : "Add a mobile number"}
                      </TextButton>
                    )}
                    <PreferencesEditor
                      preferences={r.preferences}
                      onChange={(next) => savePrefs(r.memberId, next)}
                      patientName={overview.patientName}
                      isOwner={r.isOwner}
                      hasSummaryPermission={r.hasSummaryPermission}
                      disabled={busy}
                      who={r.isMe ? "you" : r.name}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3 border-t border-plum/10 pt-4">
            <SecondaryButton
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await sendSummary({ userId, patientId });
                  const who = res.sent
                    ? `Sent to ${res.sent}.`
                    : res.dryRun
                      ? "Dry run: logged, not sent."
                      : "Nobody gets the daily summary text yet.";
                  return `${who} “${res.preview}”`;
                })
              }
            >
              Send today&apos;s summary text now
            </SecondaryButton>
            <span className="text-sm text-plum-muted">
              {overview.summaryRecipients
                ? `${overview.summaryRecipients} ${overview.summaryRecipients === 1 ? "person gets" : "people get"} it daily at their own time.`
                : "Nobody has the daily summary text on."}
            </span>
          </div>
          {note && <p className="text-sm">{note}</p>}
          <ErrorNote message={error} />

          {overview.recent.length > 0 && (
            <details className="text-sm">
              <summary className="mono-label cursor-pointer text-plum-muted">Recent texts</summary>
              <ul className="mt-3 space-y-2">
                {overview.recent.map((t) => (
                  <li key={t.id}>
                    <span className="mono-label mr-2">{t.held ? "held" : t.status}</span>
                    <span className="text-plum-muted">
                      {new Date(t.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} →{" "}
                      {t.name ?? t.to}
                      {t.kind !== "alert" && ` · ${t.kind}`}
                    </span>
                    <span className="block">{t.body}</span>
                    {t.reason && <span className="block text-plum-muted">{t.reason}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-xs text-plum-muted">
            Urgent alerts always text, even in quiet hours. Heads-ups text at most once per 10 minutes per phone and wait for the
            daily summary during quiet hours. Doctors and the patient aren&apos;t texted.
          </p>
        </div>
      )}
    </Panel>
  );
}
