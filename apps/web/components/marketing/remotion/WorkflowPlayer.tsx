"use client";
import React from "react";
import { WorkflowVideo, workflowVideoConfig } from "./WorkflowVideo";

let PlayerComponent: any = null;

export default function WorkflowPlayer() {
  const [PlayerLoaded, setPlayerLoaded] = React.useState<any>(null);

  React.useEffect(() => {
    if (PlayerComponent) { setPlayerLoaded(() => PlayerComponent); return; }
    import("@remotion/player").then((mod) => {
      PlayerComponent = mod.Player;
      setPlayerLoaded(() => mod.Player);
    });
  }, []);

  if (!PlayerLoaded) {
    return (
      <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-card" style={{ aspectRatio: "16/9" }}>
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <svg className="h-8 w-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-muted-foreground">Loading workflow…</span>
          </div>
        </div>
      </div>
    );
  }

  const P = PlayerLoaded;
  return (
    <div className="relative w-full overflow-hidden rounded-2xl shadow-notion-lg">
      <P
        component={WorkflowVideo}
        durationInFrames={workflowVideoConfig.durationInFrames}
        fps={workflowVideoConfig.fps}
        compositionWidth={workflowVideoConfig.width}
        compositionHeight={workflowVideoConfig.height}
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
  );
}
