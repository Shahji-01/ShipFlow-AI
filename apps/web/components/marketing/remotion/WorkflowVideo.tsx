// Remotion composition — ShipFlow AI Workflow Animation
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
} from "remotion";

/* ─── Brand tokens ───────────────────────────────── */
const C = {
  bg: "#080e0b",
  card: "#0f1a14",
  cardHover: "#112018",
  border: "#1a2e20",
  primary: "#22c55e",
  teal: "#14b8a6",
  muted: "#4d6b56",
  text: "#e2f0e8",
  textDim: "#7da886",
  grad: "linear-gradient(120deg,#22c55e,#16a37f,#14b8a6)",
};

const ease = Easing.inOut(Easing.ease);

function sp(frame: number, fps: number, delay = 0) {
  return spring({
    frame: frame - delay,
    fps,
    config: { mass: 0.5, damping: 12, stiffness: 130 },
    durationInFrames: 30,
  });
}

function fi(frame: number, s: number, e: number) {
  return interpolate(frame, [s, e], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/* ─── Step data ──────────────────────────────────── */
const STEPS = [
  {
    n: 1, title: "Feature Request", desc: "Capture idea from any channel",
    color: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)",
    icon: "💡",
  },
  {
    n: 2, title: "AI PRD", desc: "GPT-5.5 drafts full requirements",
    color: "#38bdf8", bg: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.3)",
    icon: "✨",
  },
  {
    n: 3, title: "Tasks", desc: "Auto-split into engineering work",
    color: "#fb923c", bg: "rgba(251,146,60,0.12)", border: "rgba(251,146,60,0.3)",
    icon: "📋",
  },
  {
    n: 4, title: "Code", desc: "Build with GitHub linked",
    color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)",
    icon: "⚡",
  },
  {
    n: 5, title: "AI Review", desc: "Diff checked against the spec",
    color: "#f472b6", bg: "rgba(244,114,182,0.12)", border: "rgba(244,114,182,0.3)",
    icon: "🔍",
  },
  {
    n: 6, title: "Ship", desc: "Human approves, then deploy",
    color: "#14b8a6", bg: "rgba(20,184,166,0.12)", border: "rgba(20,184,166,0.3)",
    icon: "🚀",
  },
];

/* ══════════════════════════════════════════════════
   SCENE 1 — Title card (0–59)
══════════════════════════════════════════════════ */
function SceneTitle() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eyebrow = sp(frame, fps, 4);
  const h1a = sp(frame, fps, 14);
  const h1b = sp(frame, fps, 22);
  const sub = sp(frame, fps, 32);
  const glow = interpolate(frame, [0, 30, 59], [0, 0.6, 0.4], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {/* Grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(${C.border} 1px,transparent 1px),linear-gradient(90deg,${C.border} 1px,transparent 1px)`, backgroundSize: "52px 52px", opacity: 0.4, WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 50%,black,transparent)" }} />
      {/* Glow */}
      <div style={{ position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)", width: 800, height: 400, borderRadius: "50%", background: `radial-gradient(ellipse,rgba(34,197,94,${glow}),transparent 70%)`, filter: "blur(80px)" }} />
      {/* Eyebrow */}
      <div style={{ opacity: eyebrow, transform: `translateY(${interpolate(eyebrow, [0,1],[20,0])}px)`, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 999, padding: "6px 18px" }}>
        <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: C.primary }}>WORKFLOW</span>
      </div>
      {/* Headline */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ opacity: h1a, transform: `translateY(${interpolate(h1a,[0,1],[30,0])}px)`, fontFamily: "system-ui,sans-serif", fontSize: 64, fontWeight: 900, color: C.text, letterSpacing: "-2px", lineHeight: 1.05 }}>
          From idea to production,
        </div>
        <div style={{ opacity: h1b, transform: `translateY(${interpolate(h1b,[0,1],[30,0])}px)`, fontFamily: "system-ui,sans-serif", fontSize: 64, fontWeight: 900, letterSpacing: "-2px", lineHeight: 1.1, background: C.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          automated.
        </div>
      </div>
      {/* Subtext */}
      <p style={{ opacity: sub, transform: `translateY(${interpolate(sub,[0,1],[20,0])}px)`, fontFamily: "system-ui,sans-serif", fontSize: 20, color: C.textDim, textAlign: "center", maxWidth: 600, lineHeight: 1.6, margin: 0, padding: "0 24px" }}>
        Six stages, fully orchestrated. AI handles the busywork at every step.
      </p>
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   SCENE 2 — Pipeline overview (60–179)
══════════════════════════════════════════════════ */
function ScenePipeline() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Line grows across
  const lineW = interpolate(frame, [10, 90], [0, 100], { extrapolateRight: "clamp", easing: ease });

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 60px", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${C.border} 1px,transparent 1px)`, backgroundSize: "24px 24px", opacity: 0.5 }} />

      {/* Connector line */}
      <div style={{ position: "absolute", top: "calc(50% - 48px)", left: "10%", right: "10%", height: 2, background: C.border, borderRadius: 1 }}>
        <div style={{ height: "100%", width: `${lineW}%`, background: C.grad, boxShadow: "0 0 12px rgba(34,197,94,0.6)", borderRadius: 1, transition: "width 0.1s" }} />
      </div>

      {/* Step cards */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%", position: "relative", zIndex: 1 }}>
        {STEPS.map((step, i) => {
          const s = sp(frame, fps, 8 + i * 16);
          const isActive = interpolate(frame, [8 + i * 16, 40 + i * 16], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div key={step.n} style={{ opacity: s, transform: `translateY(${interpolate(s,[0,1],[40,0])}px)`, display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              {/* Icon card */}
              <div style={{
                width: 88, height: 88, borderRadius: 24, background: step.bg,
                border: `2px solid ${interpolate(isActive, [0,1], [0, 1]) > 0.5 ? step.color + "80" : C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36, position: "relative",
                boxShadow: isActive > 0.5 ? `0 0 28px ${step.color}40` : "none",
              }}>
                {step.icon}
                {/* Step number badge */}
                <div style={{ position: "absolute", top: -10, right: -10, width: 28, height: 28, borderRadius: "50%", background: step.color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", fontSize: 12, fontWeight: 800, color: "#fff", boxShadow: `0 2px 8px ${step.color}60` }}>
                  {step.n}
                </div>
              </div>
              <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, fontWeight: 700, color: C.text, textAlign: "center", marginTop: 14, marginBottom: 6 }}>{step.title}</span>
              <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: C.muted, textAlign: "center", maxWidth: 100, lineHeight: 1.5 }}>{step.desc}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   SCENE 3 — Feature Request detail (180–269)
══════════════════════════════════════════════════ */
function SceneFeatureRequest() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tO = fi(frame, 4, 18);
  const tY = interpolate(frame, [4, 18], [20, 0], { extrapolateRight: "clamp" });
  const cardS = sp(frame, fps, 20);
  const textCursor = Math.floor(frame / 4) % 2 === 0;
  const typedText = "OAuth2 Social Login — Google & GitHub";
  const chars = Math.min(typedText.length, Math.floor(interpolate(frame, [28, 80], [0, typedText.length], { extrapolateRight: "clamp" })));
  const descChars = Math.min(80, Math.floor(interpolate(frame, [55, 88], [0, 80], { extrapolateRight: "clamp" })));
  const descFull = "Allow users to sign in using Google and GitHub OAuth providers. Support signup and login flows.";
  const submitO = fi(frame, 82, 90);

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "row", padding: "44px 60px", gap: 48, alignItems: "center" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${C.border} 1px,transparent 1px)`, backgroundSize: "22px 22px", opacity: 0.4 }} />
      {/* Left label */}
      <div style={{ flex: "0 0 260px", zIndex: 1 }}>
        <div style={{ opacity: tO, transform: `translateY(${tY}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(167,139,250,0.15)", border: "1.5px solid rgba(167,139,250,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>💡</div>
            <div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#a78bfa", marginBottom: 4 }}>Step 1</div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: "-0.5px" }}>Feature Request</div>
            </div>
          </div>
          <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 15, color: C.textDim, lineHeight: 1.6, margin: 0 }}>
            Describe your idea in plain language. ShipFlow captures it and kicks off the AI workflow automatically.
          </p>
          {/* Tags */}
          <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            {["Web", "Mobile", "API", "Internal"].map((tag) => (
              <span key={tag} style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, fontWeight: 600, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 12px" }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Right: form card */}
      <div style={{ flex: 1, zIndex: 1, opacity: cardS, transform: `scale(${interpolate(cardS,[0,1],[0.94,1])}) translateY(${interpolate(cardS,[0,1],[20,0])}px)` }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
          <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 20 }}>Submit Feature Request</div>
          {/* Title field */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Title</div>
            <div style={{ background: "#0a1510", border: `1px solid rgba(167,139,250,0.4)`, borderRadius: 12, padding: "12px 16px", fontFamily: "monospace", fontSize: 14, color: C.text, display: "flex", alignItems: "center", gap: 2 }}>
              <span>{typedText.slice(0, chars)}</span>
              {textCursor && chars < typedText.length && <span style={{ width: 2, height: 16, background: "#a78bfa", borderRadius: 1 }} />}
            </div>
          </div>
          {/* Description field */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Description</div>
            <div style={{ background: "#0a1510", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", fontFamily: "system-ui,sans-serif", fontSize: 13, color: C.textDim, lineHeight: 1.6, minHeight: 72 }}>
              {descFull.slice(0, descChars)}{descChars < descFull.length && textCursor && <span style={{ borderRight: `2px solid ${C.primary}`, paddingRight: 1 }} />}
            </div>
          </div>
          {/* Submit button */}
          <div style={{ opacity: submitO, transform: `translateY(${interpolate(submitO,[0,1],[8,0])}px)`, background: C.grad, borderRadius: 12, padding: "12px 20px", textAlign: "center", fontFamily: "system-ui,sans-serif", fontSize: 14, fontWeight: 700, color: "#fff", boxShadow: "0 0 24px rgba(34,197,94,0.4)", cursor: "pointer" }}>
            Submit Feature →
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   SCENE 4 — AI PRD Generation (270–389)
══════════════════════════════════════════════════ */
const PRD_SECTIONS = ["Problem Statement", "Goals & Success Metrics", "User Stories", "Acceptance Criteria", "Edge Cases", "Security Considerations"];

function ScenePRD() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tO = fi(frame, 4, 18);
  const progress = interpolate(frame, [20, 100], [0, 100], { extrapolateRight: "clamp", easing: ease });
  const prdVisible = Math.floor(interpolate(frame, [30, 110], [0, PRD_SECTIONS.length + 0.01], { extrapolateRight: "clamp" }));
  const doneS = sp(frame, fps, 108);

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "row", padding: "44px 60px", gap: 48, alignItems: "stretch" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${C.border} 1px,transparent 1px)`, backgroundSize: "22px 22px", opacity: 0.4 }} />
      {/* Left */}
      <div style={{ flex: "0 0 260px", display: "flex", flexDirection: "column", zIndex: 1 }}>
        <div style={{ opacity: tO }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(56,189,248,0.15)", border: "1.5px solid rgba(56,189,248,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>✨</div>
            <div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 4 }}>Step 2</div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: "-0.5px" }}>AI PRD</div>
            </div>
          </div>
          <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 14, color: C.textDim, lineHeight: 1.6, margin: "0 0 24px" }}>GPT-5.5 drafts a complete PRD in under a minute.</p>
          {/* Progress bar */}
          <div style={{ background: C.border, borderRadius: 999, height: 6, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ height: "100%", width: `${progress}%`, background: C.grad, borderRadius: 999, boxShadow: "0 0 8px rgba(34,197,94,0.5)" }} />
          </div>
          {/* Steps */}
          {["Analyze request","Check clarifications","Draft PRD","Validate sections","Save & advance"].map((s, i) => {
            const done = i < Math.floor(progress / 22);
            const active = i === Math.floor(progress / 22);
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, opacity: fi(frame, 8 + i * 18, 8 + i * 18 + 14) }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: done ? C.primary : active ? "rgba(34,197,94,0.15)" : C.border, border: active ? `2px solid ${C.primary}` : "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" /></svg>}
                  {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary }} />}
                </div>
                <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 12, color: done ? C.text : active ? C.primary : C.muted, fontWeight: done || active ? 600 : 400 }}>{s}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* Right: PRD doc */}
      <div style={{ flex: 1, zIndex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(56,189,248,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
          </div>
          <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 15, fontWeight: 700, color: C.text }}>Product Requirements Document</span>
          <div style={{ marginLeft: "auto", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", borderRadius: 999, padding: "3px 12px", fontFamily: "system-ui,sans-serif", fontSize: 10, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase" }}>Generating</div>
        </div>
        {PRD_SECTIONS.slice(0, prdVisible + 1).map((sec, i) => {
          const o = fi(frame, 30 + i * 14, 30 + i * 14 + 14);
          const w = interpolate(o, [0, 1], [20, 100]);
          return (
            <div key={sec} style={{ opacity: o, marginBottom: 16 }}>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, fontWeight: 700, color: "#38bdf8", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{sec}</div>
              <div style={{ height: 7, width: `${w}%`, background: C.border, borderRadius: 999, marginBottom: 4 }} />
              {i % 2 === 0 && <div style={{ height: 7, width: `${w * 0.65}%`, background: C.border, borderRadius: 999, opacity: 0.5 }} />}
              {i % 3 === 0 && <div style={{ height: 7, width: `${w * 0.8}%`, background: C.border, borderRadius: 999, opacity: 0.3, marginTop: 4 }} />}
            </div>
          );
        })}
        {/* Done badge */}
        {progress > 95 && (
          <div style={{ opacity: doneS, marginTop: 16, display: "flex", alignItems: "center", gap: 8, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: "10px 16px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" /></svg>
            <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, color: C.primary, fontWeight: 600 }}>PRD generated successfully</span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   SCENE 5 — Task Board (390–499)
══════════════════════════════════════════════════ */
const KANBAN = [
  { col: "Backlog", dot: "#64748b", tasks: ["Setup OAuth providers", "Configure callbacks"] },
  { col: "In Progress", dot: "#38bdf8", tasks: ["Google OAuth flow", "GitHub OAuth flow"] },
  { col: "In Review", dot: "#fb923c", tasks: ["Error handling"] },
  { col: "Done", dot: "#22c55e", tasks: ["Install library", "DB schema"] },
];

function SceneTasks() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tO = fi(frame, 4, 18);
  const boardS = sp(frame, fps, 22);
  const dragProgress = interpolate(frame, [55, 80], [0, 1], { extrapolateRight: "clamp", easing: ease });

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", padding: "44px 60px", gap: 28 }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${C.border} 1px,transparent 1px)`, backgroundSize: "22px 22px", opacity: 0.4 }} />
      {/* Header */}
      <div style={{ opacity: tO, display: "flex", alignItems: "center", gap: 16, zIndex: 1 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(251,146,60,0.15)", border: "1.5px solid rgba(251,146,60,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📋</div>
        <div>
          <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fb923c" }}>Step 3</div>
          <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: "-0.5px" }}>Task Board</div>
        </div>
        <div style={{ marginLeft: "auto", fontFamily: "system-ui,sans-serif", fontSize: 13, color: C.textDim }}>OAuth2 Social Login · 6 tasks</div>
      </div>
      {/* Board */}
      <div style={{ opacity: boardS, transform: `translateY(${interpolate(boardS,[0,1],[20,0])}px)`, display: "flex", gap: 16, flex: 1, zIndex: 1 }}>
        {KANBAN.map((col, ci) => (
          <div key={col.col} style={{ flex: 1, background: C.card, border: `1px solid ${ci === 1 ? "rgba(56,189,248,0.3)" : C.border}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 10, boxShadow: ci === 1 ? "0 0 20px rgba(56,189,248,0.08)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.dot }} />
              <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 12, fontWeight: 600, color: C.textDim }}>{col.col}</span>
              <span style={{ marginLeft: "auto", fontFamily: "system-ui,sans-serif", fontSize: 11, color: C.muted, background: C.bg, borderRadius: 999, padding: "1px 8px" }}>{col.tasks.length}</span>
            </div>
            {col.tasks.map((task, ti) => {
              const isDragging = ci === 0 && ti === 0 && dragProgress > 0;
              return (
                <div key={task} style={{
                  background: isDragging ? "rgba(56,189,248,0.08)" : C.bg,
                  border: `1px solid ${isDragging ? "rgba(56,189,248,0.4)" : C.border}`,
                  borderRadius: 10, padding: "10px 12px",
                  transform: isDragging ? `translateX(${dragProgress * 160}px) rotate(${dragProgress * 2}deg)` : "none",
                  boxShadow: isDragging ? "0 8px 32px rgba(0,0,0,0.5)" : "none",
                  opacity: isDragging ? 1 - dragProgress * 0.3 : 1,
                  zIndex: isDragging ? 10 : 1,
                  position: "relative",
                }}>
                  <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 12, fontWeight: 600, color: C.text }}>{task}</span>
                  {ci === 1 && <div style={{ height: 3, borderRadius: 999, background: C.grad, marginTop: 8, width: `${40 + ti * 30}%` }} />}
                  {ci === 3 && <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: C.primary, fontWeight: 700, marginTop: 4, display: "block" }}>✓ Done</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   SCENE 6 — AI Code Review (500–619)
══════════════════════════════════════════════════ */
const CODE_LINES = [
  { p: "+ ", t: "const validateCSRF = (token: string) => {", c: "#4ade80" },
  { p: "+ ", t: "  if (!token) throw new UnauthorizedError();", c: "#4ade80" },
  { p: "+ ", t: "  return verify(token, process.env.SECRET!);", c: "#4ade80" },
  { p: "+ ", t: "}", c: "#4ade80" },
  { p: "  ", t: "", c: "#4d6b56" },
  { p: "  ", t: "export async function createSession(", c: "#7da886" },
  { p: "  ", t: "  userId: string, data: SessionData", c: "#7da886" },
  { p: "  ", t: ") {", c: "#7da886" },
  { p: "  ", t: "  const token = generateToken();", c: "#7da886" },
];
const ISSUES = [
  { cat: "BLOCKING", title: "Missing CSRF validation", file: "auth/session.ts:42", ok: false, color: "#f87171" },
  { cat: "NON-BLOCKING", title: "N+1 query — batch with include", file: "api/users.ts:88", ok: true, color: "#fb923c" },
  { cat: "BLOCKING", title: "Race condition in useEffect", file: "hooks/useData.ts:77", ok: false, color: "#f87171" },
];

function SceneReview() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tO = fi(frame, 4, 18);
  const scan = interpolate(frame, [8, 70], [0, 100], { extrapolateRight: "clamp", easing: ease });
  const issuesVisible = Math.ceil(interpolate(frame, [30, 85], [0, ISSUES.length + 0.01], { extrapolateRight: "clamp" }));
  const passS = sp(frame, fps, 90);

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "row", padding: "44px 60px", gap: 40 }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${C.border} 1px,transparent 1px)`, backgroundSize: "22px 22px", opacity: 0.4 }} />
      {/* Code panel */}
      <div style={{ flex: "0 0 400px", background: "#0d1117", border: `1px solid ${C.border}`, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", zIndex: 1 }}>
        <div style={{ background: "#161b22", borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          {["#f87171","#fb923c","#4ade80"].map((c,i) => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
          <span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted, marginLeft: 8 }}>auth/session.ts</span>
        </div>
        <div style={{ position: "relative", flex: 1, padding: "14px 0", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, right: 0, height: 2, top: `${scan}%`, background: "linear-gradient(90deg,transparent,rgba(34,197,94,0.9),transparent)", boxShadow: "0 0 16px rgba(34,197,94,0.7)", transition: "top 0.1s" }} />
          {CODE_LINES.map((line, i) => (
            <div key={i} style={{ display: "flex", padding: "2px 16px", background: line.p === "+ " ? "rgba(74,222,128,0.06)" : "transparent" }}>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#2a3a2a", minWidth: 28 }}>{i + 1}</span>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: line.c }}>{line.p}{line.t}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Issues panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", zIndex: 1 }}>
        <div style={{ opacity: tO, display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(244,114,182,0.15)", border: "1.5px solid rgba(244,114,182,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔍</div>
          <div>
            <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#f472b6" }}>Step 5</div>
            <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 26, fontWeight: 800, color: C.text }}>AI Code Review</div>
          </div>
        </div>
        {/* Stats */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {[["2","Blocking","#f87171"],["1","Fixed",C.primary],["~40s","Review time",C.teal]].map(([v,l,c]) => (
            <div key={l} style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 22, fontWeight: 800, color: String(c) }}>{v}</div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: C.muted, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        {/* Issue cards */}
        {ISSUES.slice(0, issuesVisible).map((issue, i) => (
          <div key={i} style={{ opacity: fi(frame, 30 + i * 18, 30 + i * 18 + 16), background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
            <span style={{ flexShrink: 0, background: `${issue.color}18`, border: `1px solid ${issue.color}35`, borderRadius: 6, padding: "2px 7px", fontFamily: "system-ui,sans-serif", fontSize: 9, fontWeight: 700, color: issue.color, textTransform: "uppercase" }}>{issue.cat}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{issue.title}</div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>{issue.file}</div>
            </div>
            {issue.ok && <span style={{ color: C.primary, fontWeight: 700, fontSize: 13 }}>✓</span>}
          </div>
        ))}
        {/* Pass badge */}
        {issuesVisible >= ISSUES.length && (
          <div style={{ opacity: passS, marginTop: 8, display: "flex", alignItems: "center", gap: 8, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: "10px 16px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" /></svg>
            <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, color: C.primary, fontWeight: 600 }}>Review complete — ready for approval</span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   SCENE 7 — Approve & Ship (620–719)
══════════════════════════════════════════════════ */
function SceneShip() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardS = sp(frame, fps, 6);
  const statsS = sp(frame, fps, 20);
  const btnS = sp(frame, fps, 36);
  const approvedS = sp(frame, fps, 58);
  const glow = interpolate(frame, [58, 80], [0, 0.7], { extrapolateRight: "clamp" });
  const rocketS = sp(frame, fps, 64);

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "44px 80px", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${C.border} 1px,transparent 1px)`, backgroundSize: "22px 22px", opacity: 0.4 }} />
      <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 600, height: 300, borderRadius: "50%", background: `radial-gradient(ellipse,rgba(34,197,94,${glow}),transparent 70%)`, filter: "blur(80px)" }} />
      {/* Approval card */}
      <div style={{ opacity: cardS, transform: `scale(${interpolate(cardS,[0,1],[0.9,1])})`, background: C.card, border: `1px solid ${frame > 58 ? "rgba(34,197,94,0.4)" : C.border}`, borderRadius: 24, padding: 32, width: "100%", maxWidth: 600, zIndex: 1, boxShadow: frame > 58 ? "0 0 40px rgba(34,197,94,0.2)" : "0 20px 60px rgba(0,0,0,0.4)", transition: "border-color 0.3s, box-shadow 0.3s" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>OAuth2 Social Login</div>
            <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 12, color: C.muted }}>PR #47 · Acme Corp · by John Doe</div>
          </div>
          <span style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 999, padding: "4px 12px", fontFamily: "system-ui,sans-serif", fontSize: 11, fontWeight: 700, color: C.primary }}>Ready to ship</span>
        </div>
        {/* Stats */}
        <div style={{ opacity: statsS, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          {[["6/6","Tasks","#22c55e"],["3","AI Iterations","#38bdf8"],["8","Issues resolved","#22c55e"],["0","Open issues",C.muted]].map(([v,l,c]) => (
            <div key={l} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 18, fontWeight: 800, color: String(c) }}>{v}</div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: C.muted, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        {/* Button */}
        {frame < 58 && (
          <div style={{ opacity: btnS, background: C.grad, borderRadius: 14, padding: "14px 24px", textAlign: "center", fontFamily: "system-ui,sans-serif", fontSize: 15, fontWeight: 700, color: "#fff", boxShadow: "0 0 24px rgba(34,197,94,0.4)", cursor: "pointer" }}>
            Approve &amp; Ship →
          </div>
        )}
        {/* Approved state */}
        {frame >= 58 && (
          <div style={{ opacity: approvedS, display: "flex", alignItems: "center", gap: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 14, padding: "14px 20px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" /></svg>
            <div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 14, fontWeight: 700, color: C.primary }}>Approved &amp; Shipped</div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: C.textDim }}>Feature is live in production</div>
            </div>
          </div>
        )}
      </div>
      {/* Rocket + confetti burst */}
      {frame >= 64 && (
        <div style={{ opacity: rocketS, transform: `scale(${interpolate(rocketS,[0,1],[0.5,1])}) translateY(${interpolate(rocketS,[0,1],[40,0])}px)`, fontSize: 60, marginTop: 28, zIndex: 1 }}>🚀</div>
      )}
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   FADE TRANSITION
══════════════════════════════════════════════════ */
function Fade({ dur = 12 }: { dur?: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, Math.floor(dur / 2), dur], [1, 0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ background: C.bg, opacity, pointerEvents: "none" }} />;
}

/* ══════════════════════════════════════════════════
   ROOT COMPOSITION  (740 frames)
══════════════════════════════════════════════════ */
export function WorkflowVideo() {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Sequence from={0} durationInFrames={60}><SceneTitle /></Sequence>
      <Sequence from={50} durationInFrames={12}><Fade /></Sequence>
      <Sequence from={60} durationInFrames={120}><ScenePipeline /></Sequence>
      <Sequence from={170} durationInFrames={12}><Fade /></Sequence>
      <Sequence from={180} durationInFrames={110}><SceneFeatureRequest /></Sequence>
      <Sequence from={280} durationInFrames={12}><Fade /></Sequence>
      <Sequence from={290} durationInFrames={120}><ScenePRD /></Sequence>
      <Sequence from={400} durationInFrames={12}><Fade /></Sequence>
      <Sequence from={410} durationInFrames={110}><SceneTasks /></Sequence>
      <Sequence from={510} durationInFrames={12}><Fade /></Sequence>
      <Sequence from={520} durationInFrames={120}><SceneReview /></Sequence>
      <Sequence from={630} durationInFrames={12}><Fade /></Sequence>
      <Sequence from={640} durationInFrames={100}><SceneShip /></Sequence>
    </AbsoluteFill>
  );
}

export const workflowVideoConfig = {
  component: WorkflowVideo,
  durationInFrames: 740,
  fps: 30,
  width: 1200,
  height: 675,
  id: "WorkflowVideo",
};
