"use client";

import { useEffect, useRef, useState } from "react";

interface NotifiableAlert {
  _id: string;
  tier: string;
  reason: string;
}

/**
 * Pops a browser notification (and a short chime) for new urgent and notify
 * alerts while /care is open, so a phone or laptop with the page in the
 * background still gets attention. Not a replacement for SMS/push.
 */
export function useAlertNotifications(alerts: NotifiableAlert[] | undefined, patientName: string | undefined) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only API
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    if (!alerts) return;
    // The first load is history, not news.
    if (seen.current === null) {
      seen.current = new Set(alerts.map((a) => a._id));
      return;
    }
    const fresh = alerts.filter((a) => !seen.current!.has(a._id));
    fresh.forEach((a) => seen.current!.add(a._id));
    if (!fresh.length) return;
    chime(fresh.some((a) => a.tier === "urgent"));
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const a of fresh) {
      new Notification(`${a.tier === "urgent" ? "URGENT: " : ""}Cadence${patientName ? ` · ${patientName}` : ""}`, {
        body: a.reason,
        tag: a._id,
        requireInteraction: a.tier === "urgent",
      });
    }
  }, [alerts, patientName]);

  async function enable() {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  }

  return { permission, enable };
}

function chime(urgent: boolean) {
  try {
    const ctx = new AudioContext();
    const notes = urgent ? [880, 660, 880, 660] : [660, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.15);
    });
  } catch {
    // Audio blocked until the page gets a click; the visual alert is still there.
  }
}
