"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Panel } from "@/components/app/app-shell";
import { ErrorNote, errorText, SecondaryButton, Select, TextButton, TextInput } from "@/components/onboarding/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Kind = "wristband" | "med_station";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

/** Convex HTTP actions live on the .site host of the deployment. */
function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://<deployment>.convex.cloud";
  return url.replace(/\.cloud\/?$/, ".site");
}

function ago(at: number | undefined): string {
  if (!at) return "never";
  const min = Math.round((Date.now() - at) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : new Date(at).toLocaleDateString();
}

export function DevicesPanel({ userId, patientId }: { userId: string; patientId: Id<"patients"> }) {
  const devices = useQuery(api.devices.list, { patientId });
  const register = useMutation(api.devices.register);
  const remove = useMutation(api.devices.remove);
  const [kind, setKind] = useState<Kind>("med_station");
  const [deviceId, setDeviceId] = useState("box-01");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ deviceId: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function add() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      await register({ userId, patientId, kind, deviceId, tokenHash: await sha256Hex(token), label: label || undefined });
      setIssued({ deviceId, token });
      setLabel("");
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const curl = issued
    ? `curl -X POST ${siteUrl()}/device/heartbeat \\\n  -H "Authorization: Bearer ${issued.token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"deviceId":"${issued.deviceId}","firmwareVersion":"0.1.0"}'`
    : "";

  return (
    <Panel title="Devices and tokens">
      <p className="mb-5 max-w-prose text-sm text-plum-muted">
        The wristband and pillbox post to Cadence with their own token. Only a hash of the token is stored. A device that stops
        checking in for 15 minutes raises a &ldquo;device offline&rdquo; alert.
      </p>
      {devices === undefined ? (
        <p className="text-plum-muted">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="text-plum-muted">No devices yet. Pair the band from setup, or register one below.</p>
      ) : (
        <ul className="space-y-2">
          {devices.map((d) => (
            <li key={d._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-plum/10 bg-white/70 px-4 py-3">
              <span className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`size-3 rounded-full ${d.online ? "bg-emerald-500" : "bg-plum/25"}`}
                />
                <span>
                  <strong>{d.label ?? (d.kind === "wristband" ? "Wristband" : "Pillbox")}</strong>{" "}
                  <code className="text-sm text-plum-muted">{d.deviceId}</code>
                  <span className="block text-sm text-plum-muted">
                    {d.online ? "Online" : "Offline"} · last seen {ago(d.lastSeenAt)}
                    {d.firmwareVersion ? ` · firmware ${d.firmwareVersion}` : ""}
                  </span>
                </span>
              </span>
              <TextButton
                type="button"
                onClick={() => {
                  if (confirm(`Remove ${d.deviceId}? Its token stops working immediately.`)) {
                    remove({ userId, deviceId: d._id }).catch((e: unknown) => setError(errorText(e)));
                  }
                }}
              >
                Remove
              </TextButton>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-6 grid gap-3 rounded-2xl bg-lilac/70 p-4 sm:grid-cols-[180px_1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label className="space-y-1">
          <span className="mono-label text-plum-muted">Kind</span>
          <Select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as Kind;
              setKind(k);
              setDeviceId(k === "wristband" ? "band-01" : "box-01");
            }}
          >
            <option value="med_station">Pillbox</option>
            <option value="wristband">Wristband</option>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="mono-label text-plum-muted">Device id</span>
          <TextInput value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="mono-label text-plum-muted">Label (optional)</span>
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Kitchen pillbox" />
        </label>
        <SecondaryButton type="submit" disabled={busy || !deviceId.trim()}>
          {busy ? "Registering…" : "Register device"}
        </SecondaryButton>
      </form>
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>

      {issued && (
        <div role="status" className="mt-4 space-y-3 rounded-2xl border border-violet/40 bg-white p-4">
          <p>
            <strong>Token for {issued.deviceId}.</strong> Copy it now and flash it to the firmware; it won&apos;t be shown again.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded-xl bg-lilac px-3 py-2 text-sm">{issued.token}</code>
            <SecondaryButton
              type="button"
              onClick={() =>
                navigator.clipboard
                  .writeText(issued.token)
                  .then(() => setCopied(true))
                  .catch(() => prompt("Copy the token", issued.token))
              }
            >
              {copied ? "Copied ✓" : "Copy token"}
            </SecondaryButton>
            <TextButton type="button" onClick={() => setIssued(null)}>
              Done
            </TextButton>
          </div>
          <p className="mono-label text-plum-muted">Test it</p>
          <pre className="overflow-x-auto rounded-xl bg-plum p-3 text-xs text-white">{curl}</pre>
        </div>
      )}
    </Panel>
  );
}
