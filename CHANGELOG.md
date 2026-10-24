# Changelog

Running log of what's been built in Cadence, written for the next agent or teammate who picks this up.
Newest entries first. When you ship something, add an entry: what changed, where it lives, and what's still open.

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
