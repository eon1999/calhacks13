"use client";

import { Closing } from "./closing";
import { CursorGlow } from "./cursor-glow";
import { DayTimeline } from "./day-timeline";
import { PillNav } from "./pill-nav";
import { StoryStage } from "./story-stage";

// Trimmed for demo day: hero + 3 story beats, the day timeline, and the closing
// CTA. Loader, FeatureWheel ("What it does") and Surfaces ("Some of the
// surfaces") still exist in this folder; add one back here to restore it.
export function LandingPage() {
  return (
    <main className="relative bg-lilac">
      <CursorGlow />
      <StoryStage ready />
      <DayTimeline />
      <Closing />
      <PillNav visible />
    </main>
  );
}
