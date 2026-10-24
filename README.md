# Cadence

A voice wristband and pillbox for people recovering at home after surgery: spoken dose reminders, plain-language check-ins, fall and SOS escalation, and a care team that sees it all on one live timeline. Next.js 16 + Convex + Claude + Cartesia.

All data shown in the demo is **simulated** and labelled as such on every screen.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the keys below
npx convex dev               # terminal 1: syncs convex/ (schema, functions, crons) to your dev backend
npm run dev                  # terminal 2: http://localhost:3000
```

Then open **/demo** and press **Load demo patient** (or **Reset demo data**). That creates Margaret, 16 days after a knee replacement, with two weeks of simulated history.

Keys the Convex backend reads (set once per person; each dev backend is separate):

```bash
npx convex env set ANTHROPIC_API_KEY sk-ant-...   # summaries, clinician report, watch-list research
```

The Next.js voice routes read `ANTHROPIC_API_KEY` and `CARTESIA_API_KEY` from `.env.local` (see `.env.example`).

**Without keys nothing blocks:** summaries and reports fall back to fixed templates (labelled "template"), and the dose engine, alerts, fall/SOS flow, dashboards and /demo all work. Only spoken audio on /hub needs Cartesia + Claude.

## Sign-in (Clerk, optional)

Clerk switches on when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set; without it everything runs on per-browser demo identities. To turn it on:

1. Clerk Dashboard → **API keys**: copy the publishable and secret keys into `.env.local` (and Vercel) as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
2. Clerk Dashboard → **Integrations → Convex** (or a JWT template named `convex`), then `npx convex env set CLERK_JWT_ISSUER_DOMAIN <Frontend API URL>`.
3. Restart `npx convex dev` and `npm run dev`. Sign in / Sign up appear in the page headers.

Signed in, Convex identifies you by your Clerk user id (`convex/identity.ts`), so you can't act as anyone else, and the patient picker shows only your care-team patients plus the demo patient. Signed-out demo use keeps working unless you set `npx convex env set CADENCE_REQUIRE_AUTH 1`.

## Pages

| Route | Who | What it is |
| --- | --- | --- |
| `/` | Everyone | Landing page |
| `/start` | Family | Setup wizard (profile, recovery, health, medicines, band pairing, care team) |
| `/hub` | Patient | The band/hub: clock, next dose, captions, Yes/No buttons, "Are you okay?" fall check, push-to-talk voice agent, and the 3D band and debug tools |
| `/care` | Care partner | Live alerts with acknowledge, today's doses and timeline, activity, this week's adherence, Claude's daily summary |
| `/clinician/[patientId]` | Clinician | Date-range report: adherence, pain vs. time since dose, activity, events, check-in states, Claude observations citing evidence rows; print to PDF; FHIR export |
| `/settings` | Care team | Medicines and schedule, care team permissions and invites, devices and tokens |
| `/demo` | Team | Simulate every device event (lid, fall, SOS, activity, offline), run the dose engine, reset demo data |

Keep `/hub` open in one tab while pressing buttons on `/demo`: the hub speaks whatever the server raises.

## How it works

```
pillbox / wristband ──POST /device/*──►  Convex  ◄── /demo simulators (same code paths)
                                         │  dose engine cron (every minute)
                                         │  alerts: ask → hub speaks · notify/urgent → care team
                                         ▼
           /hub (speaks prompts)   /care (live)   /clinician (report)
                 │
     /api/voice/* (Next.js): Cartesia STT → Claude agent + tools → Cartesia TTS
```

**Dose engine** (`convex/doses.ts`, rules in `lib/dose-engine.ts`): a dose row opens at T − window; the hub reminds at T and again at T+15 (band buzz); no opening by T + window → missed, and the care partner gets an alert. A lid opening marks the dose "opened" (or "late"), and the hub asks "did you take them?"; only a "yes" makes it "taken". Opening again within 2 hours of a taken dose gets a gentle spoken warning and a flag; it never blocks.

**Escalation tiers** (`lib/alerts.ts`): *ask* prompts are spoken by the hub; *notify* and *urgent* alerts land on /care until someone acknowledges them. A fall asks "are you okay?" first; no answer in 30 s, or "help", becomes urgent (`convex/safety.ts`). SOS is urgent immediately. Devices silent for 15 minutes raise a "device offline" alert.

## How Claude is used

| Job | Where | Model | Guardrails |
| --- | --- | --- | --- |
| Voice agent (reminders, check-ins, consent, red flags) | `lib/voice/*`, `/api/voice/*` | `claude-sonnet-5-5`, effort low | Tools are strict; never advises on doses; red-flag phrases escalate; remembers the past week's check-ins |
| Daily care summary (8 PM cron, or on demand) | `convex/ai.ts` | `claude-sonnet-5-5` | Input is precomputed stats; zod-validated; ≤ 120 words; advice-like wording or failures fall back to a template |
| Clinician report | `convex/ai.ts` | `claude-sonnet-5-5` | Patterns are computed in code (`lib/reports/stats.ts`); Claude may only restate them; every bullet cites evidence ids, unknown ids are dropped; labelled "observations for discussion, not medical advice" |
| Pharmacy label scan | `lib/onboarding/med-scan.ts` | `claude-sonnet-5-5` | Structured output; 422 when it isn't a label |
| Watch-list research | `convex/agent.ts` | `claude-opus-5-5` | Web search limited to trusted medical domains |

All prompts and responses from summaries and reports are logged to the `aiLogs` table for review.

## How Cartesia is used

Speech-to-text (`ink-whisper`) for push-to-talk turns and text-to-speech (`sonic-3.6`, 16 kHz mono WAV, slightly slowed for older listeners) for everything Cadence says (`lib/voice/cartesia.ts`).

## Device API (for firmware)

Every request carries `Authorization: Bearer <device token>`; register a device on **/settings** to get one (only its SHA-256 is stored). Base URL is your Convex `.site` URL.

| Method and path | Body | Response |
| --- | --- | --- |
| `POST /device/activity` | `{ deviceId, steps, activeMinutes, heartRate? }` | `{ ok }` |
| `POST /device/event` | `{ deviceId, type: "lid_open" \| "sos" \| "fall", peakG? }` | `{ ok, match? }` |
| `POST /device/heartbeat` | `{ deviceId, firmwareVersion? }` | `{ led: "due" \| "taken" \| "missed" \| "off", buzz }` |

The voice endpoints the band calls are documented in `CHANGELOG.md` ("HTTP contract").

## Tests

```bash
npm test      # vitest: lib/**/*.test.ts and tests/convex (Convex functions against convex-test's in-memory backend)
npm run lint
```

## Known limitations

- **Auth is opt-in.** Clerk is wired in but off until keys are set, and signed-out demo identities still work unless `CADENCE_REQUIRE_AUTH=1`. Dashboard, report, voice and /demo functions don't yet check care-team membership or permissions (marked `TODO(auth)`).
- **No firmware yet.** `/demo` and the `/hub` simulator stand in for the band and pillbox; the device routes are ready for it.
- Alerts reach the care partner on `/care` (with a browser notification when the tab is open). No SMS or push yet.
- Moss isn't wired up (no key); the agent's memory of earlier check-ins comes from Convex.
- Not clinical-grade: thresholds are starting points, and reports are observations, not advice.
