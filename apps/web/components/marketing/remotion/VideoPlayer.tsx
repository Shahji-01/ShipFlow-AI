"use client";

import React from "react";

// Simple HTML5 video player for the demo section
// Uses /public/demo.mp4 with full custom controls
export default function VideoPlayer() {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [showControls, setShowControls] = React.useState(true);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress((v.currentTime / v.duration) * 100);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = (Number(e.target.value) / 100) * v.duration;
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    const val = Number(e.target.value);
    if (!v) return;
    v.volume = val;
    setVolume(val);
    setMuted(val === 0);
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  }

  function formatTime(s: number) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function revealControls() {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setShowControls(false), 2500);
  }

  React.useEffect(() => {
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  React.useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className="group relative w-full overflow-hidden rounded-2xl border border-border bg-black shadow-notion-lg"
      style={{ aspectRatio: "16/9" }}
      onMouseMove={revealControls}
      onMouseEnter={revealControls}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src="/demo.mp4"
        playsInline
        className="w-full h-full object-cover"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
      />

      {/* Play overlay */}
      {!playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm ring-2 ring-white/20">
            <svg className="h-9 w-9 translate-x-0.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Controls */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-8 transition-opacity duration-300 ${showControls || !playing ? "opacity-100" : "opacity-0"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="range" min={0} max={100} step={0.1}
          value={progress}
          onChange={handleSeek}
          className="mb-3 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-[#22c55e]"
        />
        <div className="flex items-center gap-3">
          <button onClick={togglePlay} className="flex h-8 w-8 shrink-0 items-center justify-center text-white hover:text-[#22c55e] transition-colors" aria-label={playing ? "Pause" : "Play"}>
            {playing
              ? <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              : <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            }
          </button>
          <span className="text-xs tabular-nums text-white/70">
            {formatTime((progress / 100) * duration)} / {formatTime(duration)}
          </span>
          <div className="flex-1" />
          <button onClick={toggleMute} className="flex h-8 w-8 items-center justify-center text-white hover:text-[#22c55e] transition-colors" aria-label="Toggle mute">
            {muted || volume === 0
              ? <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0019.73 18L21 19.27 19.73 21 3 4.27zM12 4L9.91 6.09 12 8.18V4z" /></svg>
              : <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" /></svg>
            }
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={handleVolumeChange} className="w-16 h-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-[#22c55e]" aria-label="Volume" />
          <button onClick={toggleFullscreen} className="flex h-8 w-8 items-center justify-center text-white hover:text-[#22c55e] transition-colors" aria-label="Fullscreen">
            {fullscreen
              ? <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
              : <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
