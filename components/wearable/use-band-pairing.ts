"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";

// The simulated band's identity: a device id plus a secret only the band knows.
// Convex only ever sees the secret's SHA-256 (see convex/pairing.ts).

const KEY = "cadence.band";

interface BandIdentity {
  deviceId: string;
  tokenHash: string;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadBand(): Promise<BandIdentity> {
  let stored: { deviceId: string; secret: string } | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    stored = raw ? (JSON.parse(raw) as { deviceId: string; secret: string }) : null;
  } catch {
    stored = null;
  }
  if (!stored?.deviceId || !stored.secret) {
    stored = { deviceId: `sim-${crypto.randomUUID().slice(0, 8)}`, secret: crypto.randomUUID() };
    try {
      localStorage.setItem(KEY, JSON.stringify(stored));
    } catch {
      // Storage blocked: the band gets a new identity on each load.
    }
  }
  return { deviceId: stored.deviceId, tokenHash: await sha256Hex(stored.secret) };
}

export type BandPairing =
  | { state: "loading" }
  | { state: "code"; code: string; deviceId: string }
  | { state: "paired"; deviceId: string; patientId: string; patientName: string; consent: "agreed" | "declined" | null };

/** Pairing state for the simulated band: shows a code until a family member claims it. */
export function useBandPairing(): { pairing: BandPairing; forget: () => void; error: string | null } {
  const [band, setBand] = useState<BandIdentity | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestCode = useMutation(api.pairing.requestCode);
  const status = useQuery(api.pairing.deviceStatus, band ? { deviceId: band.deviceId } : "skip");

  useEffect(() => {
    loadBand()
      .then(setBand)
      .catch(() => setError("This browser can't run the band simulator (no Web Crypto)."));
  }, []);

  const unpaired = status?.state === "unpaired";
  useEffect(() => {
    if (!band || !unpaired) return;
    requestCode(band)
      .then((res) => setCode(res.state === "code" ? res.code : null))
      .catch(() => setError("Couldn't get a pairing code from the server."));
  }, [band, unpaired, requestCode]);

  const forget = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    setCode(null);
    void loadBand().then(setBand);
  }, []);

  if (!band || !status) return { pairing: { state: "loading" }, forget, error };
  if (status.state === "paired") {
    return {
      pairing: {
        state: "paired",
        deviceId: band.deviceId,
        patientId: status.patientId,
        patientName: status.patientName,
        consent: status.consent,
      },
      forget,
      error,
    };
  }
  return { pairing: code ? { state: "code", code, deviceId: band.deviceId } : { state: "loading" }, forget, error };
}
