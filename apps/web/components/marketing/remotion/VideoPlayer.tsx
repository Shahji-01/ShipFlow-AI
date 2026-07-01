"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { ShipFlowVideo, shipFlowVideoConfig } from "./ShipFlowVideo";

// Lazy-import Player to avoid SSR issues with Remotion internals
let PlayerComponent: any = null;

function LazyPlayer() {
  const [PlayerLoaded, setPlayerLoaded] = React.useState<any>(null);

  React.useEffect(() => {
    if (PlayerComponent) {
      setPlayerLoaded(() => PlayerComponent);
      return;
    }
    import("@remotion/player").then((mod) => {
      PlayerComponent = mod.Player;
      setPlayerLoaded(() => mod.Player);
    });
  }, []);

  if (!PlayerLoaded) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-border bg-card"
        style={{ aspectRatio: "16/9" }}
      >
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <svg className="h-8 w-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-muted-foreground">Loading demo…</span>
          </div>
        </div>
      </div>
    );
  }

  const P = PlayerLoaded;
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-border shadow-notion-lg">
      {/* pointer-events-none wrapper makes the whole player non-interactive */}
      <div className="pointer-events-none select-none">
        <P
          component={ShipFlowVideo}
          durationInFrames={shipFlowVideoConfig.durationInFrames}
          fps={shipFlowVideoConfig.fps}
          compositionWidth={shipFlowVideoConfig.width}
          compositionHeight={shipFlowVideoConfig.height}
          style={{ width: "100%", aspectRatio: "16/9" }}
          controls={false}
          loop
          autoPlay
          initiallyMuted
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
        />
      </div>
      {/* Bottom badge */}
      <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
        Live demo
      </div>
    </div>
  );
}

export default function VideoPlayer() {
  return <LazyPlayer />;
}
