# Cadence

A voice wristband for people recovering at home after surgery: spoken dose reminders, plain-language check-ins, and alerts to the care team when it matters. Next.js 16 + Convex + Claude.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the keys below
npx convex dev               # terminal 1: syncs convex/ to your dev backend
npm run dev                  # terminal 2: http://localhost:3000
```

Keys the Convex backend needs (set once per person, since each dev backend is separate):

```bash
npx convex env set ANTHROPIC_API_KEY sk-ant-...   # research agent (convex/agent.ts)
```

The Next.js voice routes read `ANTHROPIC_API_KEY` and `CARTESIA_API_KEY` from `.env.local` (see `.env.example`).

## Pages

| Route | What it is |
| --- | --- |
| `/` | Landing page |
| `/start` | Family-led setup wizard (profile, recovery, health, medicines, band pairing, care team) |
| `/hub` | Demo hub: spinnable 3D band, patient onboarding (conditions, medications, emergency contacts), watch-list research, and the voice simulator |
| `/care` | Today for family and caregivers: medicines (mark taken), check-ins, open alerts |
| `/settings` | My notifications: presets, quiet hours, daily summary time |
| `/clinician/[patientId]` | Printable 7/14-day recovery report for the doctor |

## ⚠️ Heads-up after pulling (Oct 24)

- **Run `npm install`.** New packages: `three`, `@react-three/fiber`, `@react-three/drei` (the 3D band on `/hub`).
- **Run `npx convex dev`.** It pushes the new tables (`watchLists`, `patients.health`, `patients.emergencyContacts`) and functions (`profile.*`, `watchList.*`) to your dev backend. Without it, `/hub` errors with *"Could not find public function"*.
- **Set `ANTHROPIC_API_KEY` on Convex** (command above), or watch-list research will fail.
- **Files that changed under you**, in case you have local edits:
  - `components/onboarding/steps/meds-step.tsx`: the form is now a shared `MedicationEditor`, used by `/start` and `/hub`
  - `components/wearable/wearable-simulator.tsx`: takes `band` and `agent` props; `hub-demo.tsx` owns the hooks
  - `convex/onboarding.ts`: validators exported, medication insert extracted to `insertMedication`
  - `lib/voice/prompt.ts`: adds health background and emergency contacts to the prompt
  - `convex/agent.ts`: rewritten as the watch-list research agent (heart rate, temperature, movement)
- **Testing the research agent:** on `/hub`, create the demo patient and step through onboarding to **Finish**. Results appear in 1–2 minutes and each run is billed to your Anthropic key. To watch from the terminal, run `npx convex logs`.
- **Auth TODO:** `convex/profile.ts` and `convex/watchList.ts` are public and unauthenticated (like `convex/voice.ts`). They're fine for the demo but must be gated before real use.

## Tests

```bash
npm test      # vitest, lib/**/*.test.ts
npm run lint
```
