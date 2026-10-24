# Changelog

Running log of what's been built in Cadence, written for the next agent or teammate who picks this up.
Newest entries first. When you ship something, add an entry: what changed, where it lives, and what's still open.

---

## 2026-10-24: Band firmware (ESP32), written ahead of the hardware

`firmware/band` is a PlatformIO project for the wristband: steps, heart rate, falls and SOS, posted to the device API. The LED and buzz follow the heartbeat reply. No voice on the band: the phone does that. See `firmware/band/README.md`.
- **Core logic** (`lib/cadence_core`, no Arduino code): `StepCounter` (gravity removed, runs of 4 so waving isn't walking), `FallDetector` (free fall, then a ≥2.5 g impact within 1 s, then 1.5 s still), `BeatDetector` (BPM from the MAX30102's raw IR wave, 0 off-wrist or stale), `ActivityWindow` (per-window counts, cleared only after the server takes them), JSON writers and a heartbeat reply parser, and `synthetic` signals.
- **Tests** (`npm run firmware:test`): 34 cases, built with g++ (`-Wall -Wextra -Werror`) on this machine against synthetic walking, falls, bumps and pulses from 50 to 150 bpm. They use a tiny harness in `test/native/check.h`, so nothing needs downloading.
- **ESP32 side** (`src/`): a 50 Hz sensor task, separate from the HTTP loop, so a fall isn't missed during a slow request. MPU6050 (raw I2C, ±8 g) and MAX30102 (SparkFun library, 50 sps) drivers. Event retry every 5 s (events raised during a request aren't lost), LED patterns that go quiet if heartbeats stop for 90 s, and a 2 s SOS hold on the BOOT button. A C++ review found no compile problems against Arduino-ESP32 2.0.x. It did find nine runtime issues, all fixed: stale buzzing, a chirp stuck on after 24.8 days of uptime, out-of-order pulse timestamps, a lost second event, the sensor task's stack size, the MAX30102 library resetting the I2C pins, a fingertip-only contact threshold (now `config::kNoContactIr`), unverified TLS (now warned at boot), and knocks counting as falls.
- **`band-sim` build**: the same firmware on a bare ESP32 with made-up sensors, driven from the serial monitor (`w` walk, `f` fall, `s` SOS, `o` off wrist). It posts a window every minute.
- `npm run fake-band` (previous entry) still covers the server side with no board at all.

**Open:** not yet compiled for ESP32 (no PlatformIO here) or run on a board. Thresholds are tuned on synthetic signals and need real wrist data, especially `kNoContactIr`, and whether slow slumps still count as falls. HTTPS skips certificate checks unless `CADENCE_ROOT_CA` is set. Wi-Fi details are compiled in. No battery, sleep or OTA. The pillbox has no firmware yet.

---

## 2026-10-24: Fake band for building without hardware

`npm run fake-band` stands in for the wristband. It posts to the real `/device/activity`, `/device/event` and `/device/heartbeat` routes with a device token from `/settings`, so auth, `deviceId` matching and schema errors all get exercised.
- **Generator** (`lib/fake-band.ts`, tested in `lib/fake-band.test.ts`): `normal`, `resting` and `inactive` scenarios. Counts are per window, BPM rises with activity, about 1 window in 10 has no pulse, and falls peak at 2.5–4.5 g.
- **CLI** (`scripts/fake-band.mts`): streams windows and heartbeats (`--speed` compresses time, `--fall-after` adds one fall), or sends a single `fall` / `sos` / `lid`. It reads `FAKE_BAND_ID`, `FAKE_BAND_TOKEN` and the site URL from `.env.local`.
- `tsconfig.json` gains `allowImportingTsExtensions` so Node can run the script directly (Node 24 strips types).
- README's Device API section now says counts are per window and the band needs no clock.

---

## 2026-10-24: feat/voice-on-task merged with main

Both sides kept. Where they overlapped:
- **Text routing** (`lib/notify/plan.ts`): `planTexts(tier, members, recent, now, timeZone = "UTC", testTo?)` takes main's quiet hours and this branch's debug test phone. The test phone still wins (every alert, unthrottled, ignoring quiet hours). The hub overview returns `testTextTo` alongside main's `patientName`, `urgentGap` and `summaryRecipients`.
- **Debug alerts** (`convex/debug.ts` → `raiseAlert`) use main's `raiseAlert` with `kind: "voice_agent"`, so they're texted like a real alert. While a test phone is set, `convex/phone.ts` `callUrgent` rings only that number too, so urgent test triggers never phone the real emergency contacts.
- **`/demo` stays main's team control panel. The judge guide moved to `/try`.** The hub's "Demo guide" link, setup's "Back to the demo guide" and the landing "Try the demo" card point there. The guide's step 3 reads main's `kind === "alert"` on texts (it was `!test`).
- **`/hub`** keeps main's frame (dusk sky, auth controls) and `HubDemo` (3D band, patient onboarding, now and safety cards, spoken prompts), which owns `band` and `agent` and passes them down. It also takes this branch's mode: `/hub?demo=1` hides onboarding and debug tools, loads nothing until paired, and shows **Try it**. The heading and the Demo view, Demo guide and Debug tools links sit in `HubDemo`, in white. `WearableSimulator({ band, agent, mode })` keeps the restyled lilac cards (now 90% opaque so they read on the sky), the chat bubbles and the right-column layout. Text alerts show for any loaded patient (main), not only a paired one.
- **`OnboardingShell`** shows main's `AuthControls` next to the label. The `wide` option this branch added for the hub is gone, because the hub no longer uses the shell.
- **`ChoiceCard` is back**, because main's health step and preferences editor use it. Setup's relationship, surgery and role pickers stay dropdowns. The frequency dropdown and medicine suggestions live in main's `MedicationEditor`.
- **Landing cards**: main's reframed list, with Demo controls swapped for "Try the demo" (`/try`). Demo controls stays reachable from the app nav and "Seed a demo".

**Verified:** `npm install` (main added Clerk and three.js), `tsc` (app and `convex/`), `eslint`, unit tests, `next build`. Browser checks of `/hub`, `/hub?demo=1`, `/try` and `/demo` are noted in the PR.

---

## 2026-10-24: Simulator matches the design, headings in sentence case

**Simulator** (`/hub` and `/hub?demo=1`) now uses the landing/setup look instead of grey shadcn defaults.
- It sits in `OnboardingShell` (the wordmark header and lilac clouds) via a new `wide` prop that drops the aside column, under a display heading with a Debug or Demo tag. The links between views are mono labels.
- `.cadence-theme` in `app/globals.css` points the shadcn tokens (`--primary`, `--card`, `--border`, …) at the palette, so every Card, Button and Badge inside the hub becomes lilac glass with violet accents without per-component edits. It's scoped to the hub, so other pages are untouched.
- **The band** has a plum bezel, a strap, a lilac face and the glass-pill mic, with the status in the display serif. It's pinned on the left (`md:sticky`) with the typed-input box under it.
- **The right column** holds Today's medicines (time in violet mono, name in serif), then Conversation, then Try it or Debug tools, then Band setup and Text alerts side by side. The conversation is chat bubbles: the patient on the right, Cadence on the left, device events as labelled dividers.
- Card titles, section labels and inputs share classes in `components/wearable/styles.ts`. `cardTitle` spells the mono label out as utilities, because `.mono-label` (a component class) loses to CardTitle's own font utilities.

**Display headings are sentence case.** `.display` no longer uppercases. The source text was already written in sentence case, so the landing page, setup, the demo guide and the simulator now read "*What* do they take, and when?" instead of "*What* DO THEY TAKE, AND WHEN?". Line height went from 0.86 to 0.92 so descenders don't collide. Mono labels are still all caps.

**Verified:** `tsc`, `eslint`, unit tests. In the browser: `/hub` (debug) with a typed turn rendered as bubbles; `/hub?demo=1` with the auto-reminder event divider and the Try it card; 375px width with no horizontal scroll (band and cards inside 20px gutters); the landing page and `/demo` headings computed as `text-transform: none`; no console errors.
- The dev server missed the first `globals.css` change until the file was touched again, so if headings still look uppercase, touch the file or restart `next dev`.

## 2026-10-24: Setup pickers are dropdowns

Setup's button groups are now dropdowns, so each step is a short column of fields instead of a wall of pills and cards.
- **Medicines** (`steps/meds-step.tsx`): **How often** is a dropdown of the presets. Adding or removing a time by hand switches it to **Custom times**, and the time chips and "+ Add time" still sit below it. The **Medicine** field suggests 17 common post-op medicines (painkillers, antibiotics, blood thinners, anti-nausea, stool softeners) through a `<datalist>`, and you can still type anything or scan the label.
- **Their recovery**: the surgery is a dropdown. "Something else" still opens the free-text field.
- **You**: "You are their…" is a dropdown.
- **Care team**: the invite role is a dropdown. The role's one-line description shows under it.
- `Select` in `components/onboarding/ui.tsx` now draws its own chevron, and its `className` goes on the wrapper. `ChoiceCard` is gone because nothing uses it.
- Action buttons stay buttons, since each one does something when you click it: the debugger's events and phrases, the family-text triggers, and **Try it**.

**Verified:** `tsc`, `eslint`, 77 unit tests. In the browser, each dropdown shows the saved value. Picking a preset sets the times, and adding a time flips it to Custom times. "Something else" opens the text field, and the role hint follows the selection. There were no console errors.

## 2026-10-24: Family text triggers in the debugger, demo flow for judges

**Debugger: Text the family** (`/hub` → Debug tools, `components/wearable/family-texts-section.tsx`)
- A **test phone** input sets `patients.testTextTo`. While it's set, **every** alert for that patient texts only that number, unthrottled, instead of the care team (`planTexts(..., testTo)` in `lib/notify/plan.ts`, unit-tested). That covers the trigger buttons below *and* alerts the agent raises itself (Fall, SOS, a red-flag phrase), so you can test the real pipeline without paging anyone's real phone. **Off** clears it.
- Three triggers raise an alert directly, without Claude: **Urgent: fall**, **Heads-up: wound**, **Please check in** (`ask`). They're disabled until a test number is set.
- The last three texts (status, masked number, body, Twilio's reason) show under the triggers. "What the agent wrote" and the activity endpoint now include `texts` and `testTextTo`.
- New debug-gated routes: `POST /api/debug/test-phone {patientId, phone}` (empty phone turns it off; a bad number is a 400) and `POST /api/debug/alert {patientId, tier, reason}`. Convex: `debug.setTestTextTo`, `debug.raiseAlert`.

**Demo flow** (what a judge does)
- `/demo` is now a live three-step guide (`components/demo/demo-guide.tsx`): **Set it up** (→ `/start`, "put your own mobile in") → **Put the band on** (→ `/hub?demo=1` in a new tab) → **Make something happen** (shows the last alert text, or why it couldn't go). Each step ticks itself off from Convex and localStorage, and it updates live when setup changes in another tab. **Start over for the next person** clears this browser's setup, band and identity (nothing is deleted on the server).
- `/hub?demo=1` is the judge's band: no debug tools. Until paired, it shows only the pairing code (and doesn't load or auto-remind the seeded patient). Once paired, a **Try it** card (fall, SOS, "the wound looks red", check-in) replaces the debugger. `/hub` with no param is unchanged (debug mode); each view links to the other.
- Setup's exits now point into the demo: the band step opens `/hub?demo=1`, and the done step's primary button is **Put the band on {name}** (it used to go to the empty `/care` stub), plus "Back to the demo guide".
- `/hub` reads `searchParams` inside `<Suspense>` (Next 16 Cache Components flags it otherwise); it's now a partial prerender.

**Verified:** `tsc`, `eslint`, 77 unit tests (3 new), and `next build`. In the browser against the local Convex deployment with Twilio (trial) on: test number saved and normalised; Heads-up trigger → text to the test number; agent-raised urgent (fall, then "I fell… can't get up") → text to the test number only, not the team; a fresh judge run (Start over → setup with a phone → band code in a second tab → band flipped live → "the wound looks red") → heads-up text to the judge's number, shown on the band's Text alerts card and on `/demo` step 3. Every send used fictional 555 numbers, so Twilio rejected them with 572002 (trial, unverified number), which is the expected result and is shown in the UI.
- This left a test patient, "Robert Judge" (owner Jamie Judge), in the local deployment.

**Open**
- **Twilio trial:** a judge's phone only receives texts if it's verified in the Twilio console, and the trial sends the `sms_internal_alerts` template rather than Cadence's message. Upgrade the account (and do A2P 10DLC or toll-free verification) before a live demo where judges use their own phones.
- `/demo` and `/hub?demo=1` still depend on debug-only routes in one place: "Say the code" (`/api/debug/speak`) needs `CADENCE_DEBUG=1` in production.
- A forgotten test number overrides the team. The Text alerts card shows a red "Debug: every alert texts the test number…" note while one is set; turn it **Off** when you're done.

---

## 2026-10-24: Urgent alerts phone the emergency contacts; landing page reframed for families

**Urgent-alert phone calls** (`convex/phone.ts`, `lib/phone/plan.ts`)
- `raiseAlert` now also schedules `phone.callUrgent` for every new **urgent** care alert (SOS, fall with no answer, asked for help, voice-agent emergencies). A duplicate urgent alert merged into an open one isn't called again; the one call reads the merged reason.
- Who gets called: the patient's emergency contacts (up to 3, normalised to E.164 with `toE164`, duplicates dropped). If there are none, family and caregivers who get urgent alerts and have a phone. Never clinicians.
- What it says: `WELCOME_MESSAGE` in `lib/phone/script.ts`: "Hi {{contact_name}}, this is Cadence with an urgent alert about {{patient_name}}. {{reason_line}}". `reason_line` is the alert's reason, read word for word. The welcome message and `INSTRUCTIONS` must be pasted into the Cartesia agent; the code only sends the variables.
- Settings are **Convex** env vars (`CARTESIA_API_KEY`, `CARTESIA_PHONE_AGENT_ID`, `CARTESIA_FROM_NUMBER_ID`). Without them it's a dry run. Every attempt is logged in the `phoneCalls` table (placed / failed / skipped).
- `lib/phone/calls.ts` now takes a `PhoneConfig` (`phoneConfig(env)`) and returns `{ ok, ... }` instead of throwing, so it runs in Convex actions and the manual `POST /api/phone/call` route alike.
- **Live-tested:** a real call to a phone, from an urgent "possible seizure" alert on the demo patient. Cartesia accepted the `Authorization: Bearer` header.

**Landing page** (`components/landing/content.ts` and section components, `app/layout.tsx`)
- Copy now speaks to the family looking after someone: the hero is "Be there even when you can't be", the story beats are Keeps watch / Speaks up / Looks after them / Our people, the features list leads with the family dashboard and alerts, the pages grid leads with `/care` ("Family dashboard"), and the closing line is "Stay close, from anywhere". The "Care" nav link is now "Family". Layout and animations are unchanged.

**Still open**
- No seizure / sudden-shaking alert kind yet; the live test used `voice.createAlert` with seizure wording.
- `FALL_ANSWER_MS` (30 s) is long for a live demo; a demo mode could shorten it.
- No voicemail handling or call-outcome tracking (Cartesia webhooks).

**Verified:** `tsc`, `eslint`, **174 tests** (new: `lib/phone` targeting and variables; `tests/convex/phone.test.ts`, which covers an urgent alert calling once, a notify alert not calling, a merged urgent alert calling once, and a dry run without Cartesia). The demo-seed test in `tests/convex/backend.test.ts` can exceed its 5 s timeout on a busy machine; it passes with `--testTimeout=30000` and isn't affected by this change.

---

## 2026-10-24: Hub onboarding, 3D band, watch-list research agent and a phone agent skeleton

**`/hub` demo hub** (`components/wearable/hub-demo.tsx`)
- A spinnable 3D wristband (`band-model.tsx`, three.js via `@react-three/fiber` + `drei`, built in code, no model file) on the landing page's `Sky` backdrop. Drag rotates it. Zoom is off so it never captures page scroll, and vertical swipes still scroll on phones.
- **Patient onboarding panel** (`patient-onboarding.tsx`): Conditions → Medications → Emergency contacts → Done. It edits the same patient the band simulator talks to, so a new medicine shows on the band's schedule straight away. `HubDemo` owns `useBandPairing` and `useVoiceAgent` and passes them to both the panel and `WearableSimulator` (now props, not internal hooks). Backend: `convex/profile.ts` (public, no auth, like `voice.ts`).
- The medicine form is now a shared `MedicationEditor` in `components/onboarding/steps/meds-step.tsx`, used by `/start` and `/hub`. `convex/onboarding.ts` exports its validators and `insertMedication`.

**Health background** (`lib/onboarding/health.ts`)
- `/start` has a **Their health** step (`health-step.tsx`): conditions, allergies, mobility and notes, saved to `patients.health` via `onboarding.updateHealth`. `/hub` writes `health.conditions` too.
- `patients.emergencyContacts` (name, relationship, phone; up to 5).
- The voice prompt (`lib/voice/prompt.ts`) includes conditions, allergies, mobility guidance and emergency contacts. If the patient asks who to call, the band names them, and 911 always comes first.

**Watch-list research agent** (`convex/agent.ts`, `convex/watchList.ts`, `lib/watch-list.ts`)
- Clicking **Finish** in `/hub` onboarding runs `watchList.request`, which schedules `agent.researchWatchList`. Claude Opus 5.5 searches allowlisted medical sites (`web_search_20260209`, up to 8 searches) and returns a short watch list: heart rate, temperature and movement signals, each with a device-checkable threshold, an alert tier and a source URL. Signals whose source isn't on the allowlist are dropped and recorded as gaps.
- The result is submitted through a `strict` tool (Opus 5.5 rejects forced `tool_choice`; structured outputs can't be combined with web-search citations). The agent resumes `pause_turn`, sends validation errors back for a resubmit, and caps the loop at 6 turns. Server-side `fallbacks: "default"` is on.
- Stored in the `watchLists` table (one row per patient: researching / ready / failed). `watch-list-card.tsx` shows it live on the onboarding Done step, with **Re-run research**.
- Needs `ANTHROPIC_API_KEY` set on Convex. A run takes 1–2 minutes.

**Phone agent skeleton** (`lib/phone/*`, `POST /api/phone/call`)
- Places an outbound call through a Cartesia voice agent (`POST /agents/calls`, `Cartesia-Version: 2026-03-01`), passing `patient_name`, `contact_name`, `reason_line` and `callback_number` as dynamic variables.
- **All placeholders:** the welcome message, instructions and per-reason lines in `lib/phone/script.ts` are TODO text meant to be pasted into the agent in the Cartesia dashboard. It needs `CARTESIA_PHONE_AGENT_ID` and `CARTESIA_FROM_NUMBER_ID` (see `.env.example`). Without them the route returns 503 naming the missing variable.
- The route places real calls, so it's gated like the debug routes (`debugEnabled()`).

**Still open**
- Nothing uses the watch list yet. Next steps: add it to the voice prompt, and have heart rate and temperature readings raise alerts when they cross its thresholds.
- ~~Nothing places phone calls automatically yet.~~ Done: urgent alerts now call (see the entry above).
- `convex/profile.ts`, `convex/watchList.ts` and `/api/phone/call` need auth. They don't use Clerk yet.

**Verified:** `tsc`, `eslint` on the touched files, vitest (prompt health and emergency-contact tests, phone request/E.164/variable tests). The watch-list agent was run live once against the demo patient.

---

## 2026-10-24: Text alerts land on main, with per-person notification preferences, daily summary texts and scheduled check-ins

This merges `feat/voice-on-task` (Twilio text alerts, the on-task voice prompt) into main's dose engine, alerts, care dashboard and Clerk work. Where both sides had built the same thing, **main's pages won**: `/care`, `/clinician/[patientId]`, `/settings`, the seed and `raiseAlert`. My versions of `/care` and the clinician report were dropped before merging. The guiding rule for what was added: **configurable without overwhelm**.

**Texting is wired into `raiseAlert`** (`convex/alerts.ts`)
- Every *new* care-team alert (`isCareAlert`: notify, urgent, and family-facing "ask" like a declined consent) schedules `notify.textAlert`. The band's own spoken prompts (dose reminders, fall check, move nudge, check-ins) are never texted. A merged duplicate urgent alert isn't texted twice. `openAlert` is gone.
- Dry run without Twilio env vars, as before: texts are logged as `skipped` with the body that would have gone out.

**Notification preferences** (`lib/notify/preferences.ts` + tests, `careTeamMembers.notifications`)
- Each person picks one of three presets: **Just the important stuff** (default: urgent, heads-ups, daily summary text, quiet 10 PM–7 AM), **Everything**, or **Emergencies only**. The individual switches sit under a folded **Customize**: urgent, heads-ups, "please check in" (owner only), daily summary and its time, quiet hours and their times. The copy is plain language.
- Every field is optional, so existing rows resolve to the default. Saving also keeps `urgentAlerts` in sync, which the voice prompt reads.
- `planTexts()` (`lib/notify/plan.ts`) honours them. In someone's quiet hours (patient's time zone), heads-ups are logged `skipped` with "Quiet hours, saved for the daily summary" (`textMessages.heldForSummary`). **Urgent always goes.**
- Guardrails are warnings, never blocks: a warning in the editor when urgent is off, and a team warning when nobody with a phone would get urgent texts.
- UI: a **Text notifications** panel on `/settings` (`components/settings/notifications-panel.tsx`) next to main's care team panel, which already toggles the `summary` permission. It shows who's texted, their preset, phone, Change / Send test, "Send today's summary text now", and recent texts (held ones marked). The hub's **Text alerts** card has the same editor. Editing uses `setMemberPhone`'s rule: yourself, or anyone if you're the owner or patient. On `/settings`, main's "manage as the owner" demo switch applies.

**Daily summary text** (`lib/summary/daily.ts` + tests, `convex/summary.ts`, `convex/crons.ts`)
- This is separate from main's 8 PM Claude summary on `/care` (`summaries.kind: "daily"`). It's a short, rule-based SMS under 300 characters: "Cadence · Margaret, day 16 after knee replacement: took 6/6 medicines, pain 5→3, last check-in: doing well, no warning signs." Heads-ups held in quiet hours are added as a brief line.
- Stored as `summaries.kind: "daily_sms"` (`model: "rules"`), so it never stands in for, or blocks, the dashboard summary. Sent every 15 minutes to members with the summary text on, the `summary` permission and a phone, at their own time, at most once a day.

**Scheduled check-ins**
- Cadence by phase (`lib/onboarding/recovery.ts` `checkInsForDay`): first days 3×/day, early 2×, getting stronger 1×, routine every other day, pre-op none. Times are spread over 9 AM–9 PM and moved out of every dose's reminder window (`lib/voice/events.ts` `scheduledCheckInTimes`, tested).
- The **dose engine** (`convex/doses.ts` `checkScheduledCheckIn`) raises an `ask` prompt of kind `check_in` once per slot, so the hub speaks it like any other prompt. It skips a slot that already had a check-in, and waits while another prompt is pending.
- `POST /api/voice/nudge` polling (no `event`) also speaks a due scheduled check-in when no dose is due, deduped by a `check_in@<ms>` key. This is additive for firmware, plus an `X-Cadence-Event` header.

**Demo seed:** Sarah and Maria get fictional 555-01xx numbers, so the dry-run log shows texts from the `/demo` simulators. Seeded history doesn't text anyone.

**Verified:** `tsc` (app and `convex/`), `eslint` (no new warnings), **164 tests** (main's suites plus new ones: preferences, plan, summary composer, check-in cadence, and `tests/convex/notify.test.ts`), and `next build` all pass. `tests/convex/notify.test.ts` covers:
- the permission check;
- a red-flag check-in at 11:30 PM held for the owner only, with the urgent fall alert texted to both;
- a dose-reminder prompt not texted;
- the next evening's summary text, with the held line, sent once and stored as `daily_sms`;
- the urgent-gap warning;
- dose-engine check-in prompts at 11:00 and 15:15, skipped after a check-in.

**Not verified:** a live Convex deployment (the sandbox can't download the local backend), so `convex/_generated/api.d.ts` was edited by hand (adds `notify`, `summary`). **Run `npx convex dev` once.** Also not verified: live Twilio, and a check-in spoken by real Claude and Cartesia.

**Open**
- Waking hours for check-ins are fixed at 9–9.
- The patient's `/care` view doesn't show notification preferences, only `/settings` and the hub do.
- No inbound SMS ("I've got it").

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

## 2026-10-24: Voice agent stays on task

The voice agent was drifting into small talk. `lib/voice/prompt.ts` now has a **Staying on task** section. Cadence is still warm, but every reply should serve recovery (meds, symptoms, pain, mobility, sleep, mood). It doesn't start small talk or ask questions just to keep the patient talking. When the patient goes off-topic, it acknowledges briefly and steers back. It declines trivia and general questions. Once the reason for the conversation is handled, it closes in one sentence. The persona line changed from "caring friend" to "caring nurse who has a few minutes".
- Not yet checked against live Claude.

---

## 2026-10-23: Text alerts (SMS via Twilio)

Every alert Cadence raises now **texts the care team**. That covers the agent's `alert_care_team`, red-flag check-ins, and a declined first-boot consent.

**How it works**
- `convex/notify.ts` `openAlert()` is now the only way to create an alert. It inserts the row and schedules the `textAlert` internal action, which sends through Twilio's REST API (`lib/notify/twilio.ts`, plain fetch with no SDK) and logs every attempt to the new `textMessages` table (`sent`/`failed`/`skipped`).
- **Dry run by default.** Without Twilio env vars on the Convex deployment, texts are logged as `skipped` with the body that would have gone out. The hub card shows "Dry run".
- **Who gets texted** (`lib/notify/plan.ts`, unit-tested):
  - `urgent`: everyone with alerts who has `urgentAlerts` on.
  - `notify`: everyone with alerts.
  - `ask`: the owner only.
  - Doctors and the patient are never texted.
  - One text per phone number. Heads-ups go to the same phone at most once per 10 minutes; urgent alerts always go.
- Message: `Cadence · URGENT for Margaret (3:42 PM): <reason> Reply STOP to opt out.`, capped at 300 chars (two SMS segments).

**Where numbers come from** (`careTeamMembers.phone`, E.164 via `lib/notify/phone.ts`)
- Setup's "You" step has an optional **Your mobile** field.
- An invite's "Email or phone" becomes the member's alert number when they accept, if it's a phone.
- On `/hub`, once the band is paired, a **Text alerts** card lists recipients with masked numbers. It has Add/Change number and **Send test** buttons, plus the recent send log. The owner or patient can edit anyone's number; others can edit only their own.

**Turning it on**
```
npx convex env set TWILIO_ACCOUNT_SID AC...
npx convex env set TWILIO_AUTH_TOKEN ...
npx convex env set TWILIO_FROM +1...   # your Twilio number, or a Messaging Service SID (MG...)
```
Use `--prod` as well for the cloud deployment.

**Twilio trial accounts can't send custom text.** Twilio rejects it with error 572006. A trial can send only Twilio's predefined templates (`sms_internal_alerts`, `sms_account_alerts`, …), passed as the body, and only to numbers verified in the console. Set `TWILIO_TRIAL_TEMPLATE=sms_internal_alerts` and that template goes out in place of Cadence's message. The real message is still logged, with a note in the hub's send log. Remove the variable after upgrading. Production US texting also needs A2P 10DLC or toll-free verification.

**Verified:** `tsc`, `eslint`, 73 unit tests (18 new in `lib/notify/notify.test.ts`). Dry-run end to end on the local Convex deployment: setup with a phone, then urgent + notify alerts, then three `skipped` texts logged to Sarah with the right bodies. Non-members get `null` from `notify.overview` and are refused by `setMemberPhone`. This left a test patient, "SMS Test Patient" (owner `sms-e2e`), in the local deployment.

**Verified live (trial):** a test text and an urgent alert both went out through the `sms_internal_alerts` template and arrived on a real phone.

**Not verified:** custom text on an upgraded account, and the hub card in a browser. There's no delivery status callback yet, so the log records Twilio's "accepted", not "delivered".

**Open**
- No calling yet; texting only. A voice call could reuse `planTexts` for routing and Cartesia for the voice.
- No "I've got it" reply handling. Twilio inbound webhooks could acknowledge the alert (`alerts.status`).
- Same auth gap as the rest of the app: `userId` is the demo identity.

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
- **What it does** (`feature-wheel.tsx`): a pinned scroll wheel of capabilities. The centred row is lit with →, and hovering selects a row.
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
- Fixed (whole app): `--font-sans` in `globals.css` referenced itself, so all sans text fell back to Times. It now points at `--font-geist-sans`, so body text, buttons, `/hub` etc. render in Geist.
- Fixed "What it does" clipping: inactive wheel rows slid right past the column's `overflow-hidden` edge (now slide left), and `splitText` clip wrappers shaved descenders (`use-reveal.ts` pads them with offsetting negative margin).
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
- *(2026-10-24, additive)* When polling and no dose is due, it may instead speak a **scheduled check-in** (phase-based cadence, see the 2026-10-24 Tier 1 entry). Same rules: its key looks like `check_in@<ms>`, and sending it back as `lastNudgeKey` suppresses a repeat. A due dose always wins. Responses also carry `X-Cadence-Event` (`dose_due`, `check_in`, …), which devices may ignore.

Response `200 audio/wav` + `X-Cadence-Reply`, `X-Cadence-Actions`, `X-Cadence-Nudge-Key`, `X-Cadence-Event`, or `204`.

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
