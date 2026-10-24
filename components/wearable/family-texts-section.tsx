"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { BellRing, MessageCircleQuestion, Siren, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { maskPhone, toE164 } from "@/lib/notify/phone";
import type { DebugActivity } from "./use-debug-activity";
import { field } from "./styles";

type Tier = "urgent" | "notify" | "ask";

interface FamilyTextsSectionProps {
  patientId: string;
  patientName: string;
  activity: DebugActivity | null;
  refresh: () => Promise<void>;
}

// Alerts are texted by a scheduled Convex action, so the send log lags the click a little.
const TEXT_SETTLE_MS = 3000;
const RECENT_SHOWN = 3;
const STATUS_VARIANT = { sent: "secondary", failed: "destructive", skipped: "outline" } as const;

function triggers(name: string): { tier: Tier; label: string; reason: string; icon: ReactNode }[] {
  return [
    { tier: "urgent", label: "Urgent: fall", reason: `${name} said they fell and can't get up.`, icon: <Siren /> },
    {
      tier: "notify",
      label: "Heads-up: wound",
      reason: `${name} says the wound looks red and feels warm. Pain 7/10.`,
      icon: <BellRing />,
    },
    {
      tier: "ask",
      label: "Please check in",
      reason: `${name} said "not yet" to sharing updates with the family. Please talk it through.`,
      icon: <MessageCircleQuestion />,
    },
  ];
}

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return;
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(json?.error ?? `Request failed (${res.status})`);
}

/** Debug: send this patient's alert texts to a test phone, and fire alerts at it on demand. */
export function FamilyTextsSection({ patientId, patientName, activity, refresh }: FamilyTextsSectionProps) {
  const testTo = activity?.testTextTo ?? null;
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const firstName = patientName.split(/\s+/)[0] || patientName;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror the saved number into the input
    setDraft(testTo ?? "");
  }, [testTo]);

  async function run(task: () => Promise<string | null>) {
    setWorking(true);
    setNote(null);
    try {
      setNote(await task());
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setWorking(false);
    }
  }

  function saveNumber(e: FormEvent, phone: string) {
    e.preventDefault();
    void run(async () => {
      await post("/api/debug/test-phone", { patientId, phone });
      await refresh();
      return phone ? null : "Off. Alerts text the real care team again.";
    });
  }

  function fire(tier: Tier, reason: string) {
    void run(async () => {
      await post("/api/debug/alert", { patientId, tier, reason });
      await refresh();
      setTimeout(() => void refresh(), TEXT_SETTLE_MS);
      return "Alert raised. The text shows below in a few seconds.";
    });
  }

  const draftOk = !draft.trim() || toE164(draft) !== null;
  const recent = activity?.texts.slice(0, RECENT_SHOWN) ?? [];

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => saveNumber(e, draft.trim())} className="flex gap-2">
        <input
          type="tel"
          inputMode="tel"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Test phone, e.g. (415) 555-0123"
          aria-label="Test phone number for family texts"
          className={`${field} h-8 flex-1`}
        />
        <Button type="submit" size="sm" disabled={working || !draftOk || draft.trim() === (testTo ?? "")}>
          <Smartphone /> Save
        </Button>
        {testTo && (
          <Button type="button" variant="ghost" size="sm" disabled={working} onClick={(e) => saveNumber(e, "")}>
            Off
          </Button>
        )}
      </form>

      <p className="text-xs text-muted-foreground">
        {!draftOk
          ? "That doesn't look like a phone number."
          : testTo
            ? `Every alert for ${firstName} texts ${maskPhone(testTo)} instead of the care team, including ones the agent raises (try Fall or SOS above).`
            : `Add a number to play the family. Until then, alerts text ${firstName}'s real care team.`}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {triggers(firstName).map((t) => (
          <Button
            key={t.tier}
            variant={t.tier === "urgent" ? "destructive" : "outline"}
            size="sm"
            disabled={working || !testTo}
            className="h-auto min-h-8 justify-start py-1.5 text-left whitespace-normal"
            onClick={() => fire(t.tier, t.reason)}
          >
            {t.icon} {t.label}
          </Button>
        ))}
      </div>

      {note && <p className="text-xs">{note}</p>}

      {recent.length > 0 && (
        <ul className="space-y-1.5">
          {recent.map((t) => (
            <li key={t._id} className="text-xs">
              <Badge variant={STATUS_VARIANT[t.status]} className="mr-1.5">
                text · {t.status}
              </Badge>
              <span className="text-muted-foreground">→ {maskPhone(t.to)}</span> {t.body}
              {t.reason && <span className="block text-muted-foreground">{t.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
