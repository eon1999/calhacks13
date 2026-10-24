# Changelog

Running log of what's been built in Cadence, written for the next agent or teammate who picks this up.
Newest entries first. When you ship something, add an entry: what changed, where it lives, and what's still open.

---

## 2026-10-23: Landing page (anime.js, after emotion-agency.com)

`/` is now a scroll-told landing page modelled on https://emotion-agency.com/. All motion uses **anime.js v4** (`animejs@4.5.0`).

**Structure (top → bottom)**
- **Loader**: wordmark letters rise in, and an "experience is loading" bar counts to 100%. Then it clip-wipes away and the hero reveals.
- **Story stage** (`story-stage.tsx`): a sticky painted dusk sky (`sky.tsx`) plus a **particle canvas** (`particle-field.tsx`) behind the hero and 4 beats. Each beat **morphs** ~2.4k particles into its shape as it crosses mid-screen: torus (the band) → capsule (Reminds) → voice wave (Listens) → heart (Cares) → sphere (Our people). Particles spin, pulse to a lub-dub heartbeat, scatter from the cursor and spring back. The sky layers parallax with the pointer. A right-edge index shows the active beat.
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
- `prefers-reduced-motion` is respected: the loader is skipped, there is no spin or pulse, morphs are instant, and text shows without animation.
- Triggers use IntersectionObserver rather than anime's `onScroll`. It's simpler, and it behaves identically under React StrictMode's double-mount.
- Not yet checked on a real phone. Mobile layout centres the shape higher and uses fewer particles (1.1k).

---

