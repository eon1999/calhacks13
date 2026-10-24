"use client";

import { useCallback, useState } from "react";
import { Closing } from "./closing";
import { CursorGlow } from "./cursor-glow";
import { DayTimeline } from "./day-timeline";
import { FeatureWheel } from "./feature-wheel";
import { Loader } from "./loader";
import { PillNav } from "./pill-nav";
import { StoryStage } from "./story-stage";
import { Surfaces } from "./surfaces";

export function LandingPage() {
  const [ready, setReady] = useState(false);
  const onLoaded = useCallback(() => setReady(true), []);

  return (
    <main className="relative bg-lilac">
      <Loader onDone={onLoaded} />
      <CursorGlow />
      <StoryStage ready={ready} />
      <FeatureWheel />
      <Surfaces />
      <DayTimeline />
      <Closing />
      <PillNav visible={ready} />
    </main>
  );
}
