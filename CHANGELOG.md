# Changelog

Running log of what's been built in Cadence, written for the next agent or teammate who picks this up.
Newest entries first. When you ship something, add an entry: what changed, where it lives, and what's still open.

---

## 2026-10-24: Clerk sign-in (off until keys are set)

Clerk app `app_3L8w9uL7WMgglgSoAK50VLOntIN` (chosen in the Clerk Dashboard). The Clerk CLI couldn't reach Clerk from the build sandbox, so this is the manual Next.js setup; no keys are committed.

- `lib/clerk.ts`: `clerkEnabled` = `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set. Everything below is inert without it, so nobody needs an account to run the app.
- `proxy.ts` (Next 16's middleware): `clerkMiddleware()`; no routes are forced behind sign-in.
- `app/layout.tsx`: `ClerkProvider` (shadcn theme from `@clerk/ui`) inside `<body>`, plus `ClerkIdentityBridge` (`components/auth/clerk-identity.tsx`).
- `components/convex-client-provider.tsx`: `ConvexProviderWithClerk` when enabled, so Convex calls carry the Clerk token.
- `components/onboarding/use-demo-identity.ts`: returns the Clerk user id when signed in; otherwise the old per-browser demo id.
- `components/auth/auth-controls.tsx`: Sign in / Sign up (modal) or `UserButton`, in the AppShell, onboarding and /hub headers.
- `convex/auth.config.ts`: trusts tokens from `https://perfect-ewe-2767.clerk.accounts.dev` (hard-coded: Convex refuses to deploy an auth config that reads an unset env var). `convex/identity.ts` `resolveUserId()`: a signed-in caller is `identity.subject` whatever `userId` they send; signed out falls back to the demo id unless `CADENCE_REQUIRE_AUTH=1`. Used by `membership`/`requireManager` (so onboarding, invites, pairing, devices and settings), `createPatient` and invites.
- `reports.patients`: signed in, lists only your care-team patients plus the demo patient.
- `tests/convex/identity.test.ts`: spoofing another user's id fails when signed in; demo mode still works.

**Open:** dashboard/report/voice/demo functions still don't check membership or permissions; sign-in isn't verified against a live Clerk app from here (no network to Clerk). Roles per view (patient / care partner / clinician) can now hang off `careTeamMembers.role` for the signed-in user.

---

## 2026-10-24: Dose engine, alerts, care dashboard, clinician report, settings and /demo

Closes the software side of Layer 1 and most of Layer 2 from the design doc (no firmware). Everything works without API keys; Claude-written text falls back to labelled templates.

**Backend (Convex)**
| Path | What |
|---|---|
| `lib/dose-engine.ts` (+ test), `convex/doses.ts`, `convex/crons.ts` | Every-minute engine: dose row at T−window, hub reminder at T and T+15, missed + care alert at T+window (fresh misses only). Lid openings → `opened` / `late` (to T+90) / `extra_opening` within 2 h of a taken dose. Low-activity nudge after 3 still waking hours. Device-offline alert after 15 silent minutes (only devices that have really posted over HTTP). |
| `lib/alerts.ts`, `convex/alerts.ts` | Alert kinds and tiers. `ask` alerts with a prompt kind are **hub prompts** (`pendingPrompts`, `markDelivered`); notify/urgent go to `/care` (`forCare`, `acknowledge`). Urgent alerts within 2 min are merged (device + agent both raising one). |
| `convex/safety.ts` | Fall → event + spoken "are you okay?" + 30 s timer → urgent `fall_unanswered`. `imOkay`, `needHelp`, `pending`. A calm voice check-in with trigger `fall` also cancels. SOS → urgent immediately. |
| `convex/http.ts`, `convex/devices.ts` | `/device/activity`, `/device/event`, `/device/heartbeat` with bearer auth against `devices.tokenHash` (SHA-256). Heartbeat returns `{led, buzz}`. Devices registered in /settings. |
| `lib/reports/stats.ts` (+ test), `convex/reports.ts` | Adherence, pain (incl. by hours since last dose), activity, events, check-in states, and **patterns computed in code**, each with evidence row ids. Queries `care`, `clinician`, `patients`. |
| `lib/reports/summaries.ts`, `convex/ai.ts` | Claude (`claude-sonnet-5-5`) daily summary (8 PM local via hourly cron, or on demand) and clinician report. zod structured output, invented citations dropped, advice-like wording rejected, template fallback (`model: "template"`). All prompts/responses in `aiLogs`. |
| `lib/demo-history.ts`, `convex/seed.ts` | Demo Margaret is now day 16 after a knee replacement with **14 days of simulated history** (`patients.isDemo`), incl. missed 2 PM doses, late doses, an extra opening, a fall she was fine after, a red-flag wound check-in, pain falling 7→3, steps rising. |
| `convex/demo.ts` | Simulators via the same code paths as the device routes; `resetDemo` deletes demo patients only. |
| `convex/settings.ts` | `overview`, `updateMedication`, `setPermissions`, `revokeMember` (owner/patient only). |
| `convex/voice.ts` | Uses `raiseAlert` (with kinds); `confirmDose` closes reminders and a missed alert; two "struggling" check-ins in a row → notify; `getContext` adds `recentCheckIns` (7 days) as agent **memory** (stand-in for Moss). |

**Schema (additive, all optional):** `patients.isDemo`; `doseEvents.remindersSent/lastRemindedAt`; `alerts.kind/refId/deliveredAt` + index `by_patient_created`; `summaries.sections`; `devices.label` + indexes `by_tokenHash`, `by_patient`; new table `aiLogs`.

**Pages**
- `/hub`: speaks server prompts automatically (`use-hub-prompts.ts`; reminders, "did you take them?" after a lid opening, fall check, SOS, move nudge); big clock / next dose / captions / Yes-No card; "Are you okay?" countdown with I'm okay / I need help. The old 30 s due-dose polling is now an opt-in fallback in Debug tools. New wearable events `lid_opened`, `extra_opening`; `/api/voice/nudge` takes `logged: true` so server-logged falls aren't double-logged.
- `/care`: alerts first with one-tap acknowledge, today's doses and timeline, activity charts, week adherence, daily summary (+ "write now"), care team, browser notification + chime for new alerts.
- `/clinician/[patientId]`: date range, adherence, pain over time and by hours since dose, steps/HR, events, patterns (code), Claude observations with evidence chips → evidence table, print/PDF, **FHIR R4 export** (`lib/fhir.ts`).
- `/settings`: medicines (edit times/window), care team permissions/revoke/invites, device registration (token shown once, only hash stored).
- `/demo`: every flow with hardware unplugged, live feed, pending hub prompts, fall countdown, reset.
- Shared: `components/app/` (`AppShell` with nav + patient picker + **simulated-data banner**, `useSelectedPatient`, `useNow`).

**Tests:** `tests/convex/*` run Convex functions against `convex-test` (reminders → missed alert → acknowledge, lid → confirm → extra opening, fall timer/cancel, SOS dedup, struggling twice, HTTP auth + LED, offline, seed + reports + template summaries, reset). 104 tests, `tsc`, `eslint`, `next build` pass.

**Gotchas / open**
- Not verified against a live Convex deployment (unreachable from the build sandbox) — `convex/_generated/api.d.ts` was regenerated by hand. Run `npx convex dev` once; it will regenerate it and push the crons.
- **Deploy:** run `npx convex deploy` (new tables, indexes, crons). Existing seeded Margaret keeps her old 3-day history; press **Reset demo data** on /demo.
- Hub reminders need `/hub` open (it's the band's stand-in). Two open `/hub` tabs on the same patient will both speak.
- No auth (patient picker per browser; `/settings` has a demo "Manage as the owner" switch). No SMS here — see `feat/voice-on-task` (Twilio); when it lands, route `raiseAlert` notify/urgent through its `openAlert` texting.

---

## 2026-10-23: Post-op pivot, finished

Parkinson's-specific pieces are now post-op recovery ones throughout.

**Changed**
- **Check-in states** (`lib/schemas.ts`, `convex/schema.ts`, `convex/voice.ts`): `moving_well | stiff_shaky | extra_movement | unsure` → `doing_well | sore_but_managing | struggling | unsure`. Warning signs still go in `redFlag`.
- **Pain score:** `checkIns.painScore` (0–10, optional). `record_check_in` takes a required, nullable `pain_score` (strict tool, `type: ["integer","null"]`; verified live). The prompt shows check-ins as "sore but managing, pain 6/10 (knee throbbing)". This also fixes a `replace("_")` that only replaced the first underscore.
- **Tremor → activity:** the `tremor_spike` event is now `low_activity` ("Inactive for hours"). The band asks how they feel and suggests a short walk or ankle pumps only if their care plan allows. Check-in trigger `tremor_spike` → `low_activity`. Table `tremorSamples` → `activitySamples` (steps, activeMinutes, optional heartRate). `tremorPayload` → `activityPayload`. `/device/tremor` → `/device/activity` (still a 501 stub). `patients.tremorBaseline` removed.
- **Safety prompt:** heavy bleeding is now urgent. Fever, a wound that is red or leaking, calf pain or swelling, and pain much worse than before are `notify`. The `red_flag` description lists the same signs.
- **Demo seed** (`convex/seed.ts`): Margaret Lee, 3 days after a knee replacement (dates relative to today), on Acetaminophen, Apixaban and Cephalexin, with Sarah (daughter, owner) and Maria (caregiver) on the team.
- **Debug phrases:** "My knee is really throbbing, maybe a 7 out of 10." and "The wound looks red and it feels warm."
- **Landing:** hero kicker, loader line, story subtitles, feature wheel (pain and wound check-ins, recovery timeline, move-more nudges) and the "day with Cadence" ledger are rewritten for recovery after surgery. So are the page metadata.

**Verified live:** `low_activity` nudge → "my knee is throbbing, about a 7, and the bandage looks a bit red" → check-in saved as `struggling`, `painScore: 7`, `redFlag: true`, `trigger: low_activity`, and the agent followed up on fever and calf pain. `tsc`, `eslint`, 73 unit tests and `next build` pass.

**Deploy note:** Convex rejects the narrower schema if an existing deployment has check-ins with old states or `tremorSamples` rows. The dev deployment had none. Clear them before `npx convex deploy` if the cloud deployment does.

---

## 2026-10-23: Onboarding (family-led), pivot to post-op recovery

**Product pivot:** Cadence now supports people **recovering at home after surgery** instead of only people with Parkinson's. Onboarding captures the procedure and surgery date, and the voice agent's persona and check-ins follow the recovery phase. The check-in states (`moving_well`/`stiff_shaky`/…), tremor tables and landing copy still say Parkinson's; that's the next pivot step.

**Decisions (from a design grilling)**
- **Stakeholders and roles:** family/friends (`care_partner`), paid caregiver/home aide (`caregiver`, new), doctor (`clinician`), and the patient (`patient`, new). What each role gets lives in `lib/onboarding/roles.ts`. Doctors get reports only, never live pages.
- **A family member starts setup and owns the profile.** The owner **or the patient** can invite people; caregivers and doctors can't.
- **The patient's app is opt-in.** The band is their main interface. Their onboarding is a **spoken consent** on the band's first boot. A "no" doesn't switch anything off; it opens an `ask` alert so the family talks it through.
- **Pairing:** the band shows and speaks a 6-digit code, and the owner types it in.
- **Auth:** Clerk was chosen, but no keys exist yet. Everything takes a `userId` from a **demo identity** in localStorage (`components/onboarding/use-demo-identity.ts`). Swap it for Clerk plus `ctx.auth` when keys arrive.

**Flows**
- `/start`: the setup wizard. Steps: You → Who it's for (name, what to call them, language, time zone, "extra patience") → Recovery (procedure, surgery/discharge dates, discharge notes, with a live "Day 3 after surgery · First days home" preview) → Medicines (manual entry, or **scan the pharmacy label** with Claude vision) → Pair band (skippable) → Care team invites (skippable) → All set. Progress persists in localStorage, so a refresh resumes where you left off.
- `/join/[token]`: accepting an invite, then a role intro listing exactly what you will and won't be told about. If the browser is already a team member (the owner testing their own link), "Continue as someone new" switches **this tab only** (sessionStorage).
- `/hub`: a new **Band setup** card shows the pairing code ("Say the code" speaks it). Once paired, the simulator switches to that patient live, and **First time on the wrist** runs the consent intro.

**Where things live**
| Path | What |
|---|---|
| `lib/onboarding/recovery.ts` (+ test) | Procedures, recovery phases (pre-op, first days 0–3, early 4–14, strengthening 15–42, routine 43+), and what the agent focuses on in each |
| `lib/onboarding/pairing.ts` (+ test) | Code generation, normalising and formatting, spoken form |
| `lib/onboarding/roles.ts` | Role titles, permissions, gets/doesn't-get copy |
| `lib/onboarding/med-scan.ts`, `app/api/onboarding/scan-med` | Label photo → `{name, doseLabel, times, instructions}` via structured outputs (Sonnet 5.5, effort low, fallbacks on). Returns 422 when it isn't a label. "As needed" returns no times. |
| `convex/onboarding.ts` | `createPatient`, `updatePatient`, `addMedication`, `removeMedication`, `setup` query, and the `requireManager` guard |
| `convex/invites.ts` | `create`, `revoke`, `get`, `accept` (7-day tokens) |
| `convex/pairing.ts` | `requestCode`, `deviceStatus`, `claim`. The band sends only the SHA-256 of its own secret, which is copied to `devices.tokenHash`, ready for device auth. |
| `convex/schema.ts` | Patient profile fields (`preferredName`, `language`, `extraPatience`, `recovery`, `consent`, `ownerUserId`), more `careTeamMembers` fields, and the new `invites` and `pairingCodes` tables |
| `lib/voice/{prompt,tools,events,context}.ts` | The prompt adds "About them" (recovery phase and focus, care notes, extra patience), "Care team" and "Consent". New `first_boot` event and `record_consent` tool. |
| `components/onboarding/*` | Wizard, steps, and form primitives in the landing's lilac/plum style |
| `components/convex-client-provider.tsx` | `ConvexReactClient` for `/start`, `/join` and `/hub`. It's created after mount, because its constructor uses `Math.random()`, which Next's prerender rejects. |

**Verified live** (Claude, Cartesia and the Convex dev deployment): the whole wizard; adding a medicine; label scan (an Oxycodone label read in about 3.8 s; a non-label returned 422); pairing (the simulator flipped to the patient in real time); invite → join as Maria → she appeared live on Sarah's team list; first boot ("…let Sarah, your daughter, and Maria, your caregiver, know…") → "yes" → `record_consent` → the band card shows "Consent: agreed". `tsc`, `eslint`, 54 unit tests and `next build` all pass.

**Gotchas / open**
- **Deploy:** run `npx convex deploy` before Vercel picks this up (new tables and functions).
- **No real auth.** `userId` comes from the client, so any caller can claim to be the owner. This is the same class of gap as `convex/voice.ts`.
- Invites aren't sent by email or SMS. The owner copies the link.
- `/care`, the caregiver checklist and the patient's own view are still stubs. After joining, everyone except doctors goes to `/care`.
- "Say the code" uses `/api/debug/speak`, which is off in production unless `CADENCE_DEBUG=1`.
- Simulator: audio in a background or undrawn tab never fires `ended`, so the band sits at "Speaking…" (this predates onboarding). Keep the tab in front.

---

## 2026-10-23: Vercel deployment notes

No pipeline code depended on `.env.local`: `lib/voice/config.ts` reads `process.env` per request, so Vercel project env vars work as-is.

**Set these in Vercel → Project Settings → Environment Variables (then redeploy):**
`ANTHROPIC_API_KEY`, `CARTESIA_API_KEY`, `NEXT_PUBLIC_CONVEX_URL` (the **cloud** URL, after `npx convex deploy`), and optionally `CARTESIA_VOICE_ID` and `CADENCE_DEBUG=1`.

**Changed:** `MAX_AUDIO_BYTES` 5 MB → 4 MB (Vercel rejects request bodies over 4.5 MB before our handler runs), and missing-config errors now mention Vercel env vars.

**Gotchas**
- Vercel builds with `NODE_ENV=production`, so the debug routes return 403 and the `/hub` debug panel errors unless `CADENCE_DEBUG=1` is set.
- The Convex cloud deployment starts empty and needs its functions deployed (`npx convex deploy`) and a patient seeded.
- `/api/demo/seed`, `/hub` and all Convex functions are still unauthenticated on a public URL.

---

## 2026-10-23: Voice agent live test and fixes

First live end-to-end run with real Claude and Cartesia keys (keys live in `.env`, which Next.js loads alongside `.env.local`). Exercised by direct API calls and by clicking through the `/hub` debug panel.

**Bugs found and fixed**
- **Duplicate actions.** Conversation history stores only spoken text, so Claude couldn't see what it had already done. It re-alerted on almost every turn (5 duplicate alerts in one 6-turn conversation), saved check-ins twice, and apologized for things it had done. Fix: `voice.getContext` now returns `checkInsToday` and `alertsToday`, and the system prompt has a **"Done today"** section (database is the source of truth across sessions) plus rules: no repeats, one check-in per conversation, red-flag check-in already alerts, and no alerting on missed doses alone. Result: 0 duplicates.
- **Wrong check-in trigger.** A check-in saved on the patient's reply was tagged `manual`. `voiceTurns` now stores `event` on event turns, and `conversationEvent()` finds the event that started the conversation.
- **Replies too long for voice** (up to ~75 words). The prompt now caps replies at about 35 words with no recaps. They now run 16–34 words.
- **Overpromising.** The agent said "help is on the way" after an alert. The prompt now says notifying the care team ≠ help coming.
- **Bad WAV header.** Cartesia's `/tts/bytes` WAV used the `0xFFFFFFFF` streaming placeholder for RIFF and data sizes, which strict parsers (Safari, MCU players) reject. `lib/voice/wav.ts` `fixWavSizes()` now writes real sizes on every TTS response.

**Added**
- `Server-Timing` header on `/api/voice/turn` and `/nudge` (`stt`, `llm`, `tts` in ms). It shows in browser devtools.

**Measured (Sonnet 5.5, effort low)**
- Per turn 2.5–6 s total: Claude 1.8–5.2 s (dominant; tool-using turns are 2 calls), TTS 0.6–1.2 s, STT ~0.13 s.
- Audio STT worked: a TTS-generated WAV was transcribed exactly.

**Not verified live**
- Polling dedup when a dose is actually due (it was past the 8 PM window during testing; `nudgeKey` is unit-tested).
- Real microphone recording in the browser (only synthesized audio was tested through STT).

**Next options for latency:** stream Claude + Cartesia TTS over WebSocket so speech starts on the first sentence, or try `thinking: {type: "between_tools"}` on Sonnet 5.5.

---

## 2026-10-23: Landing page (anime.js, after emotion-agency.com)

`/` is now a scroll-told landing page modelled on https://emotion-agency.com/. All motion uses **anime.js v4** (`animejs@4.5.0`).

**Structure (top → bottom)**
- **Loader**: wordmark letters rise in, and an "experience is loading" bar counts to 100%. Then it clip-wipes away and the hero reveals.
- **Story stage** (`story-stage.tsx`): a sticky painted dusk sky (`sky.tsx`) plus a **particle canvas** (`particle-field.tsx`) behind the hero and 4 beats. Each beat **morphs** ~2.4k particles into its shape as it crosses mid-screen: ECG heartbeat line → capsule (Reminds) → voice wave (Listens) → heart (Cares) → sphere (Our people). Particles sway gently (no full spin, so the flat heartbeat line never turns edge-on; no pulsing), scatter from the cursor and spring back. The sky layers parallax with the pointer. A right-edge index shows the active beat.
- **What it does** (`feature-wheel.tsx`): a pinned scroll wheel of capabilities. The centred row is lit with ↪, and hovering selects a row.
- **Some / of the / surfaces** (`surfaces.tsx`): tilt-on-hover cards linking to `/hub`, `/care`, `/demo`, `/settings`.
- **A day with Cadence** (`day-timeline.tsx`): an awards-table-style ledger of a day's moments.
- **Closing** (`closing.tsx`): CTA, link columns, giant wordmark. Also a floating **glass pill nav** (`pill-nav.tsx`) and a **cursor glow** (`cursor-glow.tsx`).

**Where things live**
| Path | What |
|---|---|
| `lib/landing/particles.ts` (+ `.test.ts`) | Pure maths: seeded 3D shape point clouds, projection, cursor repel, spring, heartbeat |
| `components/landing/content.ts` | All landing copy and data (headlines, beats, features, surfaces, day timeline) |
| `components/landing/use-reveal.ts` | `splitText` word-mask rise and `[data-fade]` fade-up, played on mount or when in view |
| `components/landing/use-in-view.ts` | IntersectionObserver trigger (beat activation and reveal-on-enter) |
| `app/layout.tsx`, `app/globals.css` | Adds Instrument Serif (display) and IBM Plex Mono (labels), palette tokens (`lilac`, `plum`, `violet`), `.display`, `.mono-label`, `.tag-pill`, `.glass-pill` |

**Notes / open**
- Emotion's display serif is proprietary, so **Instrument Serif** stands in. Their 3D WebGL landscape is approximated with 2D canvas plus layered SVG.
- Gotcha: tokens in `@theme inline` are **not** emitted as CSS variables. Hand-written CSS in `globals.css` must use the next/font vars (`--font-instrument-serif`, `--font-plex-mono`) or literal values, not `var(--font-display)` / `var(--color-violet)`.
- Headlines are plain italic + uppercase lines; the ↪ indents were removed by request.
- `prefers-reduced-motion` is respected: the loader is skipped, there is no spin or pulse, morphs are instant, and text shows without animation.
- Triggers use IntersectionObserver rather than anime's `onScroll`. It's simpler, and it behaves identically under React StrictMode's double-mount.
- Not yet checked on a real phone. Mobile layout centres the shape higher and uses fewer particles (1.1k).

---

## 2026-10-23: Debug tools for testers, model switched to Sonnet 5.5

### Model change
- The agent now runs on **`claude-sonnet-5-5`** at effort `low` (`lib/voice/config.ts`). The team chose it because check-ins and reminders are short conversational turns that don't need Opus-level reasoning. Refusal fallback (`fallbacks: "default"`) still applies.

### Debug panel (`/hub` → "Debug tools", `components/wearable/debug-panel.tsx`)
| Control | What it does |
|---|---|
| **Trigger wearable event** | Fires `POST /api/voice/nudge` with an event so the agent speaks first: `dose_due`, `missed_dose`, `check_in`, `tremor_spike`, `fall`, `sos` |
| **Patient says** | One-tap canned utterances sent as text turns. Lets testers exercise the agent without a mic. |
| **Test voice message** | Speaks any typed text through the wearable's TTS voice **without Claude** (`POST /api/debug/speak`). Use it to check the speaker/voice path in isolation. |
| **What the agent wrote** | Live feed of alerts, check-ins, fall/SOS events and dose confirmations (`GET /api/debug/activity`). Refreshes after every turn. |
| **Reset today's data** | Deletes today's doseEvents, checkIns, alerts, events and all voiceTurns for the patient (`POST /api/debug/reset`). |
| **Auto-remind** | Toggles the 30-second due-dose polling (moved here from the old events card). |

### Behavior changes
- **New wearable events** in `lib/voice/events.ts`: `missed_dose`, `tremor_spike` (check-in trigger `tremor_spike`), and `sos` (the agent is told to alert urgently).
- **`fall` and `sos` are now logged** to the Convex `events` table (`voice.logDeviceEvent`) *before* the agent runs, so they're recorded even if Claude or TTS fails.
- **A forced `dose_due`** with nothing actually due now targets the next upcoming dose time (all meds at that time), else the latest missed one. Previously it said "see schedule". Logic is in `slotsForEvent()`.

### New files
- `lib/debug.ts`: `debugEnabled()`. Debug routes are on in dev, and in production only with `CADENCE_DEBUG=1`. Otherwise they return 403.
- `app/api/debug/{speak,activity,reset}/route.ts`
- `convex/debug.ts`: `activity` query, `resetToday` mutation. These are public like `convex/voice.ts`, which is the same auth gap.
- `components/wearable/{debug-panel.tsx,use-debug-activity.ts}`

### Still open
- Still not verified against live Claude/Cartesia (no keys in this environment).
- The debug panel always renders on `/hub`; only the API routes are gated.

---

## 2026-10-23: Voice agent v1 (Claude + Cartesia), wearable simulator

### Goal

The end product is a **wristband** that talks to a person with Parkinson's. It reminds them about medications,
checks in on how they're moving and feeling, and escalates to their care team when something is wrong.
The firmware doesn't exist yet (`firmware/band/` is empty), so v1 runs as a **web-based backup**:

- All voice logic lives **server-side** behind plain HTTP endpoints that the wristband will call later.
- `/hub` is a **browser wearable simulator** that calls those same endpoints.

### Architecture

```
wristband (later) / /hub simulator
   │  POST audio (wav/webm)                      POST {event} or poll
   ▼                                             ▼
/api/voice/turn                              /api/voice/nudge
   │ Cartesia STT (ink-whisper)                  │ decides if a dose is due
   ▼                                             ▼
lib/voice/agent.ts  runAgentTurn()  ── Claude (claude-sonnet-5-5, effort low) + tools
   │   tools: mark_dose_taken, record_check_in, alert_care_team  → Convex mutations
   │   history: Convex `voiceTurns` table keyed by sessionId
   ▼
Cartesia TTS (sonic-3.6) → 16 kHz mono s16le WAV → device speaker
```

Why this shape:
- **Stateless device.** The wristband only records audio, POSTs it, and plays back WAV. Conversation memory is in Convex by `sessionId`.
- **16 kHz s16le WAV** is small and plays straight out of I2S on an MCU without decoding.
- **Next.js route handlers, not Convex actions**, hold the API keys and the audio pipeline. Binary request/response bodies are simpler there.
- **Non-streaming v1.** Each turn is request → full WAV. Streaming TTS over WebSocket is the obvious latency upgrade later.

### HTTP contract (for firmware)

All bodies and responses are UTF-8. Text in response headers is `encodeURIComponent`-encoded.

**`POST /api/voice/turn`** (`multipart/form-data`)
| field | |
|---|---|
| `patientId` | Convex `patients` id |
| `sessionId` | any string the device picks per conversation (≤128 chars) |
| `audio` | recorded speech, any container Cartesia accepts (wav, webm, ogg, mp3…), ≤5 MB |
| `text` | *(instead of audio)* already-transcribed text, for testing |

Response `200 audio/wav` with headers `X-Cadence-Transcript`, `X-Cadence-Reply`, `X-Cadence-Actions` (comma-separated tool names).

**`POST /api/voice/nudge`** (JSON). The agent speaks first.
```json
{ "patientId": "...", "sessionId": "...", "event": "dose_due" | "missed_dose" | "check_in" | "tremor_spike" | "fall" | "sos", "lastNudgeKey": "..." }
```
- With `event`: always speaks (fall follow-up, scheduled check-in, forced reminder).
- Without `event` (polling): speaks only if a dose is currently due **and** its `X-Cadence-Nudge-Key` differs from `lastNudgeKey`; otherwise `204`. The device should store the returned key so it doesn't repeat the reminder.

Response `200 audio/wav` + `X-Cadence-Reply`, `X-Cadence-Actions`, `X-Cadence-Nudge-Key`, or `204`.

**`GET /api/voice/patient?patientId=`**: patient and today's dose slots as JSON (simulator display). Defaults to the first patient.

**`POST /api/demo/seed`**: creates demo patient "Margaret" and her meds (idempotent).

Errors are JSON `{ success: false, error }` with 400/404/413/502/500.

### Files

| Path | What |
|---|---|
| `lib/schedule.ts` | Pure: "HH:mm" + time zone → today's dose slots with status `upcoming/due/taken/missed`. Shared by Next and Convex. |
| `lib/voice/agent.ts` | `runAgentTurn()`: loads context, replays history, runs the Claude tool loop, and saves turns |
| `lib/voice/prompt.ts` | System prompt (persona, safety rules, today's schedule with `slot_id`s) |
| `lib/voice/tools.ts` | Tool schemas (strict) and executors (zod-validated → Convex mutations) |
| `lib/voice/events.ts` | Wearable events (`dose_due`, `check_in`, `fall`) and nudge logic |
| `lib/voice/cartesia.ts` | Cartesia STT (`POST /stt`) and TTS (`POST /tts/bytes`) via fetch |
| `lib/voice/config.ts` | Model ids, voice, sample rate, limits, and env access |
| `lib/voice/http.ts` | Response helpers and error → status mapping |
| `app/api/voice/{turn,nudge,patient}/route.ts`, `app/api/demo/seed/route.ts` | Endpoints above |
| `convex/voice.ts` | Queries and mutations the agent uses (`getContext`, `confirmDose`, `recordCheckIn`, `createAlert`, `getTurns`, `appendTurns`) |
| `convex/seed.ts` | `seedDemo` |
| `convex/schema.ts` | **Added** `voiceTurns` table (role `user`/`assistant`/`event`) |
| `components/wearable/*` | Simulator UI on `/hub`: round "watch face", tap-to-talk, typed fallback, event buttons, auto-reminder polling, schedule, and transcript |

Writes the agent makes: `doseEvents` (status `taken`, `source: "voice"`), `checkIns` (with transcript), and `alerts` (`notify`/`urgent`; a red-flag check-in also opens a `notify` alert).

### Running it

1. Copy `.env.example` → `.env.local` (already created by Convex), and set `ANTHROPIC_API_KEY` and `CARTESIA_API_KEY`.
2. `npx convex dev` (local anonymous deployment works without an account: `CONVEX_AGENT_MODE=anonymous npx convex dev`).
3. `npm run dev` → open `/hub` → **Seed demo patient** → tap the mic or use the event buttons.
4. `npm test` runs the vitest unit tests (`lib/**/*.test.ts`).

### Known gaps / next steps

- **No auth.** Endpoints take a raw `patientId`, and `convex/voice.ts` functions are public. Before real use, add device-token auth (`devices.tokenHash`, same TODO as `convex/http.ts`) and make the Convex functions internal or secret-gated.
- **Latency.** Non-streaming STT → Claude → TTS. Upgrades: Cartesia streaming TTS over WebSocket, streaming Claude, or Cartesia's streaming STT.
- **Scheduled check-ins** are only triggered manually (simulator button or `event: "check_in"`). A Convex cron or the device heartbeat should decide when.
- **Fall events** from `/device/event` don't trigger the voice agent yet. Wire `convex/http.ts` → device → `/api/voice/nudge {event:"fall"}`.
- Not yet verified end-to-end against live Claude/Cartesia (no keys in this environment at time of writing). Only typecheck, lint, build, unit tests, and the key-free endpoints were checked.
- Claude refusals fall back server-side (`fallbacks: "default"`); if the whole chain refuses, the reply is a generic "didn't catch that".
