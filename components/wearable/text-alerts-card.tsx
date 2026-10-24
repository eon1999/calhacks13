"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { MessageSquareText, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDemoIdentity } from "@/components/onboarding/use-demo-identity";
import { toE164 } from "@/lib/notify/phone";

interface TextAlertsCardProps {
  patientId: string;
}

const STATUS_VARIANT = { sent: "secondary", failed: "destructive", skipped: "outline" } as const;

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  // Convex wraps thrown errors as "[CONVEX ...] ... Uncaught Error: <message>\n at ...".
  return raw.match(/Uncaught Error: (.*)/)?.[1] ?? raw;
}

/** Who gets texted when Cadence raises an alert, with a test button and the recent send log. */
export function TextAlertsCard({ patientId }: TextAlertsCardProps) {
  const { identity } = useDemoIdentity();
  const overview = useQuery(
    api.notify.overview,
    identity ? { userId: identity.id, patientId: patientId as Id<"patients"> } : "skip",
  );
  const setPhone = useMutation(api.notify.setMemberPhone);
  const sendTest = useAction(api.notify.sendTestText);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(task: () => Promise<string | null>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await task());
    } catch (error: unknown) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function save(e: FormEvent, memberId: Id<"careTeamMembers">) {
    e.preventDefault();
    if (!identity) return;
    void run(async () => {
      await setPhone({ userId: identity.id, memberId, phone: draft });
      setEditing(null);
      return null;
    });
  }

  function test(memberId: Id<"careTeamMembers">) {
    if (!identity) return;
    void run(async () => {
      const result = await sendTest({ userId: identity.id, memberId });
      return result.status === "sent" ? "Test text sent." : `Not sent: ${result.reason}`;
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquareText className="size-4" /> Text alerts
        </CardTitle>
        {overview && (
          <Badge variant={overview.live ? "secondary" : "outline"}>{overview.live ? "Live (Twilio)" : "Dry run"}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {overview === null && (
          <p className="text-muted-foreground">
            Only the patient&apos;s care team can see this. Open it in the browser that ran{" "}
            <a href="/start" className="underline">setup</a>.
          </p>
        )}

        {overview?.testTextTo && (
          <p className="rounded-md border border-destructive/30 px-2 py-1.5 text-xs text-destructive">
            Debug: every alert texts the test number {overview.testTextTo} instead of the people below. Turn it off in
            Debug tools → Text the family.
          </p>
        )}

        {overview && overview.recipients.length === 0 && (
          <p className="text-muted-foreground">No family or caregivers on the team yet.</p>
        )}

        {overview && (
          <ul className="space-y-2">
            {overview.recipients.map((r) => (
              <li key={r.memberId} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {r.name}
                    {r.isMe && " (you)"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{r.phone ?? "no number"}</span>
                  {!r.urgentAlerts && <Badge variant="outline">no urgent texts</Badge>}
                  {r.canEdit && editing !== r.memberId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(r.memberId);
                        setDraft("");
                      }}
                    >
                      {r.phone ? "Change" : "Add number"}
                    </Button>
                  )}
                  {r.phone && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => test(r.memberId)}>
                      <Send /> Send test
                    </Button>
                  )}
                </div>
                {editing === r.memberId && (
                  <form onSubmit={(e) => save(e, r.memberId)} className="flex gap-2">
                    <input
                      type="tel"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="(415) 555-0123"
                      aria-label={`Mobile number for ${r.name}`}
                      className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1"
                    />
                    <Button type="submit" size="sm" disabled={busy || (!!draft.trim() && !toE164(draft))}>
                      {draft.trim() ? "Save" : "Remove"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {message && <p className="text-xs">{message}</p>}

        {overview && overview.recent.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Recent texts</p>
            <ul className="space-y-2">
              {overview.recent.map((t) => (
                <li key={t.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge>
                    <span className="text-muted-foreground">
                      {new Date(t.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} → {t.name ?? t.to}{" "}
                      ({t.to}){t.test && " · test"}
                    </span>
                  </div>
                  <p className="mt-1">{t.body}</p>
                  {t.reason && <p className="text-muted-foreground">{t.reason}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Urgent alerts always text. Heads-ups text at most once per 10 minutes per phone. Doctors aren&apos;t texted.
        </p>
      </CardContent>
    </Card>
  );
}
