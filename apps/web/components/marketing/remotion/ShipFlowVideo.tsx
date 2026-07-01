// Remotion composition — ShipFlow AI cinematic explainer
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

/* ─── Brand ─────────────────────────────────────── */
const C = {
  bg: "#080e0b",
  card: "#0f1a14",
  border: "#1a2e20",
  primary: "#22c55e",
  teal: "#14b8a6",
  muted: "#4d6b56",
  text: "#e2f0e8",
  textDim: "#7da886",
  grad: "linear-gradient(120deg,#22c55e,#16a37f,#14b8a6)",
};

/* ─── Easing ─────────────────────────────────────── */
const ease = Easing.inOut(Easing.ease);

/* ─── Spring helper ─────────────────────────────── */
function sp(frame: number, fps: number, delay = 0) {
  return spring({
    frame: frame - delay,
    fps,
    config: { mass: 0.6, damping: 14, stiffness: 120 },
    durationInFrames: 35,
  });
}

/* ─── Fade ───────────────────────────────────────── */
function fi(frame: number, s: number, e: number) {
  return interpolate(frame, [s, e], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/* ══════════════════════════════════════════════════
   SCENE 1 — Hero (0–99)
══════════════════════════════════════════════════ */
function SceneHero() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logo = sp(frame, fps, 4);
  const dot = sp(frame, fps, 10);
  const h1a = sp(frame, fps, 18);
  const h1b = sp(frame, fps, 24);
  const sub = sp(frame, fps, 32);
  const glow = interpolate(frame, [0, 40, 80], [0, 0.45, 0.3], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* glow wash */}
      <div style={{ position: "absolute", top: "-15%", left: "50%", transform: "translateX(-50%)", width: 900, height: 550, borderRadius: "50%", background: `radial-gradient(ellipse,rgba(34,197,94,${glow}),transparent 70%)`, filter: "blur(70px)" }} />
      {/* grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(${C.border} 1px,transparent 1px),linear-gradient(90deg,${C.border} 1px,transparent 1px)`, backgroundSize: "52px 52px", opacity: 0.5, WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 40%,black,transparent)" }} />

      {/* logo */}
      <div style={{ opacity: logo, transform: `scale(${interpolate(logo, [0, 1], [0.7, 1])}) translateY(${interpolate(logo, [0, 1], [20, 0])}px)`, display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: C.grad, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(34,197,94,0.55)" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <span style={{ fontFamily: "system-ui,sans-serif", fontWeight: 800, fontSize: 30, color: C.text, letterSpacing: "-0.5px" }}>ShipFlow AI</span>
      </div>

      {/* pill */}
      <div style={{ opacity: dot, display: "flex", alignItems: "center", gap: 8, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.28)", borderRadius: 999, padding: "6px 18px", marginBottom: 24 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.primary, boxShadow: "0 0 10px #22c55e" }} />
        <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, fontWeight: 600, color: C.primary, letterSpacing: "0.06em", textTransform: "uppercase" }}>AI-native delivery platform</span>
      </div>

      {/* headline */}
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ opacity: h1a, transform: `translateY(${interpolate(h1a, [0, 1], [30, 0])}px)`, fontFamily: "system-ui,sans-serif", fontSize: 76, fontWeight: 900, color: C.text, letterSpacing: "-3px", lineHeight: 1 }}>
          Ship features
        </div>
        <div style={{ opacity: h1b, transform: `translateY(${interpolate(h1b, [0, 1], [30, 0])}px)`, fontFamily: "system-ui,sans-serif", fontSize: 76, fontWeight: 900, letterSpacing: "-3px", lineHeight: 1.1 }}>
          <span style={{ background: C.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>with confidence.</span>
        </div>
      </div>

      {/* sub */}
      <p style={{ opacity: sub, transform: `translateY(${interpolate(sub, [0, 1], [20, 0])}px)`, fontFamily: "system-ui,sans-serif", fontSize: 22, color: C.textDim, textAlign: "center", maxWidth: 600, lineHeight: 1.6, margin: 0 }}>
        Raw idea → PRD → Tasks → AI Review → Human Approval → Shipped.
      </p>
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   SCENE 2 — Pipeline (100–249)
══════════════════════════════════════════════════ */
const STEPS = [
  { n: 1, label: "Feature Request", desc: "Any channel", color: "#a78bfa" },
  { n: 2, label: "AI Clarification", desc: "Q&A + PRD", color: "#38bdf8" },
  { n: 3, label: "Task Planning", desc: "Kanban board", color: "#fb923c" },
  { n: 4, label: "Development", desc: "GitHub linked", color: "#22c55e" },
  { n: 5, label: "AI Code Review", desc: "Diff vs spec", color: "#f472b6" },
  { n: 6, label: "Ship ✓", desc: "Human approved", color: "#14b8a6" },
];

function ScenePipeline() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleO = fi(frame, 5, 22);
  const titleY = interpolate(frame, [5, 22], [24, 0], { extrapolateRight: "clamp" });
  const lineW = interpolate(frame, [20, 110], [0, 100], { extrapolateRight: "clamp", easing: ease });

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "0 50px" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${C.border} 1px,transparent 1px)`, backgroundSize: "22px 22px", opacity: 0.55 }} />

      <p style={{ opacity: titleO, transform: `translateY(${titleY}px)`, fontFamily: "system-ui,sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.primary, marginBottom: 10 }}>The Delivery Workflow</p>
      <h2 style={{ opacity: titleO, transform: `translateY(${titleY}px)`, fontFamily: "system-ui,sans-serif", fontSize: 46, fontWeight: 800, color: C.text, letterSpacing: "-1.5px", margin: "0 0 52px", textAlign: "center" }}>
        6 stages. Fully orchestrated.
      </h2>

      {/* connector line */}
      <div style={{ position: "absolute", top: "54%", left: 90, right: 90, height: 2, background: C.border }}>
        <div style={{ height: "100%", width: `${lineW}%`, background: C.grad, boxShadow: "0 0 10px rgba(34,197,94,0.5)" }} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%", position: "relative", zIndex: 1 }}>
        {STEPS.map((step, i) => {
          const s = sp(frame, fps, 18 + i * 14);
          return (
            <div key={step.n} style={{ opacity: s, transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`, display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div style={{ width: 76, height: 76, borderRadius: 22, background: C.card, border: `2px solid ${step.color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, boxShadow: `0 0 24px ${step.color}28`, marginBottom: 14, position: "relative" }}>
                {["💡", "🤖", "📋", "⚡", "🔍", "🚀"][i]}
                <div style={{ position: "absolute", top: -10, right: -10, width: 26, height: 26, borderRadius: "50%", background: step.color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", fontSize: 11, fontWeight: 800, color: "#fff" }}>{step.n}</div>
              </div>
              <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, fontWeight: 700, color: C.text, textAlign: "center", marginBottom: 4 }}>{step.label}</span>
              <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: C.muted, textAlign: "center" }}>{step.desc}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   SCENE 3 — PRD Generation (250–399)
══════════════════════════════════════════════════ */
const PRD_STEPS = ["Analyze feature request", "Check clarifications", "Draft the PRD", "Validate sections", "Save & advance"];
const PRD_SECS = ["Problem Statement", "Goals", "User Stories", "Acceptance Criteria", "Edge Cases", "Success Metrics"];

function ScenePRD() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = interpolate(frame, [10, 110], [0, 100], { extrapolateRight: "clamp", easing: ease });
  const completedSteps = Math.floor(interpolate(frame, [10, 110], [0, PRD_STEPS.length + 0.01], { extrapolateRight: "clamp" }));
  const prdVisible = interpolate(frame, [30, 120], [0, PRD_SECS.length + 0.01], { extrapolateRight: "clamp" });

  const tO = fi(frame, 4, 18);
  const tY = interpolate(frame, [4, 18], [20, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "row", padding: "44px 56px", gap: 36 }}>
      {/* left */}
      <div style={{ flex: "0 0 320px", display: "flex", flexDirection: "column" }}>
        <p style={{ opacity: tO, transform: `translateY(${tY}px)`, fontFamily: "system-ui,sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.primary, margin: "0 0 8px" }}>Phase 1 → 2</p>
        <h2 style={{ opacity: tO, transform: `translateY(${tY}px)`, fontFamily: "system-ui,sans-serif", fontSize: 34, fontWeight: 800, color: C.text, letterSpacing: "-1px", margin: "0 0 22px" }}>AI PRD<br />Generation</h2>
        {/* bar */}
        <div style={{ background: C.border, borderRadius: 999, height: 6, marginBottom: 22, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: C.grad, borderRadius: 999, boxShadow: "0 0 8px rgba(34,197,94,0.4)" }} />
        </div>
        {/* steps */}
        {PRD_STEPS.map((s, i) => {
          const done = i < completedSteps;
          const active = i === completedSteps;
          const o = fi(frame, 6 + i * 18, 6 + i * 18 + 18);
          return (
            <div key={s} style={{ opacity: o, display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? C.primary : active ? "rgba(34,197,94,0.15)" : C.border, border: active ? `2px solid ${C.primary}` : "2px solid transparent" }}>
                {done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" /></svg>}
                {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary }} />}
              </div>
              <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, color: done ? C.text : active ? C.primary : C.muted, fontWeight: done || active ? 600 : 400 }}>{s}</span>
            </div>
          );
        })}
      </div>

      {/* right: PRD doc */}
      <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 26, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(34,197,94,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
          </div>
          <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 15, fontWeight: 700, color: C.text }}>Product Requirements Document</span>
          <div style={{ marginLeft: "auto", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.22)", borderRadius: 999, padding: "3px 12px", fontFamily: "system-ui,sans-serif", fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.05em" }}>Draft</div>
        </div>
        {PRD_SECS.map((sec, i) => {
          if (i >= prdVisible) return null;
          const o = fi(frame, 30 + i * 14, 30 + i * 14 + 14);
          const w = interpolate(o, [0, 1], [15, 100]);
          return (
            <div key={sec} style={{ opacity: o, marginBottom: 14 }}>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, fontWeight: 700, color: C.primary, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{sec}</div>
              <div style={{ height: 7, width: `${w}%`, background: C.border, borderRadius: 999, marginBottom: 3 }} />
              {i % 2 === 0 && <div style={{ height: 7, width: `${w * 0.65}%`, background: C.border, borderRadius: 999, opacity: 0.5 }} />}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   SCENE 4 — AI Code Review (400–519)
══════════════════════════════════════════════════ */
const ISSUES = [
  { cat: "BLOCKING", file: "auth/session.ts:42", title: "Missing CSRF validation", ok: false },
  { cat: "NON-BLOCKING", file: "api/users.ts:88", title: "N+1 query — batch with include", ok: true },
  { cat: "BLOCKING", file: "hooks/useData.ts:77", title: "Race condition in useEffect", ok: false },
  { cat: "NON-BLOCKING", file: "components/Form.tsx:15", title: "Missing ARIA label", ok: true },
];
const ic = (c: string) => c === "BLOCKING" ? "#f87171" : "#fb923c";

function SceneReview() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tO = fi(frame, 4, 18);
  const tY = interpolate(frame, [4, 18], [20, 0], { extrapolateRight: "clamp" });
  const visible = Math.ceil(interpolate(frame, [18, 80], [0, ISSUES.length + 0.01], { extrapolateRight: "clamp" }));
  const scan = interpolate(frame, [4, 65], [0, 100], { extrapolateRight: "clamp", easing: ease });

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "row", padding: "44px 56px", gap: 36 }}>
      {/* code panel */}
      <div style={{ flex: "0 0 420px", background: "#0d1117", border: `1px solid ${C.border}`, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#161b22", borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          {["#f87171", "#fb923c", "#4ade80"].map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
          <span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted, marginLeft: 8 }}>auth/session.ts</span>
        </div>
        <div style={{ position: "relative", flex: 1, padding: "14px 0", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, right: 0, height: 2, top: `${scan}%`, background: "linear-gradient(90deg,transparent,rgba(34,197,94,0.8),transparent)", boxShadow: "0 0 14px rgba(34,197,94,0.6)" }} />
          {[
            ["+ ", "const validateCSRF = (token: string) => {", "#4ade80"],
            ["+ ", "  if (!token) throw new UnauthorizedError();", "#4ade80"],
            ["+ ", "  return verify(token, process.env.SECRET!);", "#4ade80"],
            ["+ ", "}", "#4ade80"],
            ["  ", "", C.muted],
            ["  ", "export async function createSession(", C.muted],
            ["  ", "  userId: string,", C.muted],
            ["  ", "  data: SessionData", C.muted],
            ["  ", ") {", C.muted],
            ["  ", "  const token = generateToken();", C.muted],
          ].map(([prefix, line, color], i) => (
            <div key={i} style={{ display: "flex", padding: "1.5px 16px", background: prefix === "+ " ? "rgba(74,222,128,0.06)" : "transparent" }}>
              <span style={{ fontFamily: "monospace", fontSize: 11.5, color: C.border, minWidth: 28, userSelect: "none" }}>{i + 1}</span>
              <span style={{ fontFamily: "monospace", fontSize: 11.5, color: prefix === "+ " ? String(color) : C.muted }}>{prefix}{line}</span>
            </div>
          ))}
        </div>
      </div>

      {/* issues */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <p style={{ opacity: tO, transform: `translateY(${tY}px)`, fontFamily: "system-ui,sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.primary, margin: "0 0 8px" }}>Phase 4 — AI Review</p>
        <h2 style={{ opacity: tO, transform: `translateY(${tY}px)`, fontFamily: "system-ui,sans-serif", fontSize: 34, fontWeight: 800, color: C.text, letterSpacing: "-1px", margin: "0 0 22px" }}>Diff review<br />against the spec</h2>

        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {[["2", "Blocking", "#f87171"], ["2", "Fixed", C.primary], ["~40s", "Review time", C.teal]].map(([v, l, c]) => (
            <div key={l} style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 24, fontWeight: 800, color: String(c) }}>{v}</div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 10, color: C.muted, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        {ISSUES.slice(0, visible).map((issue, i) => {
          const o = fi(frame, 18 + i * 14, 18 + i * 14 + 16);
          return (
            <div key={i} style={{ opacity: o, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <span style={{ flexShrink: 0, background: `${ic(issue.cat)}18`, border: `1px solid ${ic(issue.cat)}35`, borderRadius: 6, padding: "2px 7px", fontFamily: "system-ui,sans-serif", fontSize: 9, fontWeight: 700, color: ic(issue.cat), textTransform: "uppercase", letterSpacing: "0.04em" }}>{issue.cat}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{issue.title}</div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>{issue.file}</div>
              </div>
              {issue.ok && <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: C.primary, fontWeight: 700 }}>✓</span>}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   SCENE 5 — Ship (520–599)
══════════════════════════════════════════════════ */
function SceneShip() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const glow = interpolate(frame, [0, 35], [0, 0.65], { extrapolateRight: "clamp" });
  const rocket = sp(frame, fps, 8, 0.5, 12);
  const text = sp(frame, fps, 22);
  const cta = sp(frame, fps, 42);

  const STATS = [
    { v: "10x", l: "Faster delivery" },
    { v: "95%", l: "AI accuracy" },
    { v: "5min", l: "First PRD" },
    { v: "0", l: "Missed specs" },
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "25%", left: "50%", transform: "translateX(-50%)", width: 700, height: 450, borderRadius: "50%", background: `radial-gradient(ellipse,rgba(34,197,94,${glow}),transparent 70%)`, filter: "blur(90px)" }} />

      <div style={{ opacity: rocket, transform: `scale(${interpolate(rocket, [0, 1], [0.4, 1])}) translateY(${interpolate(rocket, [0, 1], [40, 0])}px)`, fontSize: 88, marginBottom: 14 }}>🚀</div>
      <h2 style={{ opacity: text, transform: `translateY(${interpolate(text, [0, 1], [24, 0])}px)`, fontFamily: "system-ui,sans-serif", fontSize: 62, fontWeight: 900, textAlign: "center", letterSpacing: "-2.5px", margin: "0 0 8px" }}>
        <span style={{ color: C.text }}>Feature </span>
        <span style={{ background: C.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Shipped.</span>
      </h2>
      <p style={{ opacity: text, transform: `translateY(${interpolate(text, [0, 1], [20, 0])}px)`, fontFamily: "system-ui,sans-serif", fontSize: 20, color: C.textDim, textAlign: "center", margin: "0 0 40px" }}>Human approved. Zero regressions. On spec.</p>

      <div style={{ display: "flex", gap: 18, marginBottom: 40 }}>
        {STATS.map((s, i) => {
          const ss = sp(frame, fps, 32 + i * 7);
          return (
            <div key={s.l} style={{ opacity: ss, transform: `translateY(${interpolate(ss, [0, 1], [20, 0])}px)`, background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: "18px 26px", textAlign: "center", minWidth: 110 }}>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 38, fontWeight: 900, background: C.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{s.v}</div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: C.muted, marginTop: 4 }}>{s.l}</div>
            </div>
          );
        })}
      </div>

      <div style={{ opacity: cta, transform: `scale(${interpolate(cta, [0, 1], [0.9, 1])})`, background: C.grad, borderRadius: 18, padding: "16px 44px", fontFamily: "system-ui,sans-serif", fontSize: 18, fontWeight: 700, color: "white", boxShadow: "0 0 50px rgba(34,197,94,0.55)", letterSpacing: "-0.3px" }}>
        Start building free →
      </div>
    </AbsoluteFill>
  );
}

/* ══════════════════════════════════════════════════
   TRANSITION WIPE
══════════════════════════════════════════════════ */
function FadeTransition({ dur = 10 }: { dur?: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, Math.floor(dur / 2), dur], [1, 0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ background: C.bg, opacity, pointerEvents: "none" }} />;
}

/* ══════════════════════════════════════════════════
   ROOT COMPOSITION  (600 frames = 20s @ 30fps)
══════════════════════════════════════════════════ */
export function ShipFlowVideo() {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Sequence from={0} durationInFrames={100}><SceneHero /></Sequence>
      <Sequence from={90} durationInFrames={12}><FadeTransition /></Sequence>
      <Sequence from={100} durationInFrames={150}><ScenePipeline /></Sequence>
      <Sequence from={240} durationInFrames={12}><FadeTransition /></Sequence>
      <Sequence from={250} durationInFrames={150}><ScenePRD /></Sequence>
      <Sequence from={390} durationInFrames={12}><FadeTransition /></Sequence>
      <Sequence from={400} durationInFrames={120}><SceneReview /></Sequence>
      <Sequence from={510} durationInFrames={12}><FadeTransition /></Sequence>
      <Sequence from={520} durationInFrames={80}><SceneShip /></Sequence>
    </AbsoluteFill>
  );
}

export const shipFlowVideoConfig = {
  component: ShipFlowVideo,
  durationInFrames: 600,
  fps: 30,
  width: 1200,
  height: 675,
  id: "ShipFlowVideo",
};
