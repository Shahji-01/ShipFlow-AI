"use client";

import React from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import type { Variants } from "framer-motion";

/* ─── Shared Motion Variants ──────────────────────────── */

const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const viewport = { once: true, margin: "-80px" } as const;

/* ─── Reusable Section Heading ────────────────────────── */

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
      variants={stagger}
      className="mx-auto max-w-3xl text-center"
    >
      <motion.span
        variants={fadeUp}
        className="inline-flex items-center rounded-full border border-border bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-foreground"
      >
        {eyebrow}
      </motion.span>
      <motion.h2
        variants={fadeUp}
        className="mt-5 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
      >
        {title}
      </motion.h2>
      <motion.p
        variants={fadeUp}
        className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
      >
        {description}
      </motion.p>
    </motion.div>
  );
}

/* ─── 3D Tilt Card (Aceternity-style) ─────────────────── */

function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(y, [0, 1], [8, -8]), {
    stiffness: 150,
    damping: 18,
  });
  const rotateY = useSpring(useTransform(x, [0, 1], [-8, 8]), {
    stiffness: 150,
    damping: 18,
  });

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width);
    y.set((e.clientY - rect.top) / rect.height);
  }
  function onLeave() {
    x.set(0.5);
    y.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX, rotateY, transformPerspective: 1200 }}
      className="relative [transform-style:preserve-3d]"
    >
      {/* Glow behind the card */}
      <div
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-brand-gradient opacity-25 blur-2xl"
        aria-hidden="true"
      />
      {children}
    </motion.div>
  );
}

/* ─── Hero ────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pb-24 pt-32">
      {/* Premium brand glow wash + aurora + animated grid */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="bg-aurora absolute inset-x-0 top-[-12rem] mx-auto h-[40rem] w-[min(90rem,140%)] opacity-70" />
        <div className="absolute -left-40 top-0 h-[36rem] w-[36rem] rounded-full bg-[hsl(var(--brand-from)/0.18)] blur-[130px]" />
        <div className="absolute -right-32 top-10 h-[34rem] w-[34rem] rounded-full bg-[hsl(var(--brand-to)/0.14)] blur-[130px]" />
      </div>
      {/* Animated grid with radial fade */}
      <div
        className="pointer-events-none absolute inset-0 bg-grid opacity-[0.35] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black,transparent_75%)]"
        aria-hidden="true"
      />
      {/* Spotlight */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[40rem] w-[60rem] -translate-x-1/2 [background:radial-gradient(closest-side,hsl(var(--primary)/0.10),transparent)]"
        aria-hidden="true"
      />
      {/* Faded dotted grid texture */}
      <div className="pointer-events-none absolute inset-0 bg-dot opacity-[0.5] [mask-image:radial-gradient(ellipse_at_center,black_15%,transparent_70%)]" aria-hidden="true" />

      <div className="relative z-10 mx-auto w-full max-w-5xl">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="flex flex-col items-center text-center"
        >
          {/* Pill badge */}
          <motion.div variants={fadeUp}>
            <span className="gradient-border glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-muted-foreground shadow-glow">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="text-brand-gradient font-semibold">AI-native</span>
              <span className="text-border">·</span>
              Built for engineering teams
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            className="mt-8 font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-7xl lg:text-8xl"
          >
            Ship features
            <br />
            with{" "}
            <span className="text-brand-gradient animate-shimmer-text">
              confidence
            </span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            variants={fadeUp}
            className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
          >
            ShipFlow AI turns raw feature requests into production-ready code.
            Generate PRDs, break down tasks, review code with AI, and gate every
            release behind human approval — all in one flow.
          </motion.p>

          {/* CTAs */}
          <motion.div
            variants={fadeUp}
            className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Link
              href="/register"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gradient px-7 py-3.5 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:shadow-glow-lg hover:-translate-y-0.5"
            >
              <span>Start building free</span>
              <svg
                className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link
              href="#workflow"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-7 py-3.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-secondary"
            >
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              See how it works
            </Link>
          </motion.div>
        </motion.div>

        {/* Floating product preview mockup */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4, ease: EASE }}
          className="relative mx-auto mt-16 w-full max-w-4xl"
        >
          <TiltCard>
            <ProductMockup />
          </TiltCard>

          {/* Decorative floating chips */}
          <motion.div
            className="absolute -left-6 top-16 hidden lg:block"
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden="true"
          >
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-notion-lg">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/15 text-success">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </span>
              <span className="text-xs font-medium text-foreground">Review passed</span>
            </div>
          </motion.div>
          <motion.div
            className="absolute -right-6 bottom-20 hidden lg:block"
            animate={{ y: [0, 14, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            aria-hidden="true"
          >
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-notion-lg">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-primary">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              </span>
              <span className="text-xs font-medium text-foreground">PRD generated</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Product Mockup (fake dashboard) ─────────────────── */

const pipelineCols = [
  { name: "Backlog", accent: "bg-muted-foreground/40", cards: ["OAuth login flow", "Export to CSV"] },
  { name: "In Progress", accent: "bg-primary", cards: ["Realtime presence", "Billing webhooks"] },
  { name: "Review", accent: "bg-warning", cards: ["Search v2"] },
  { name: "Shipped", accent: "bg-success", cards: ["Dark mode", "Audit log"] },
];

function ProductMockup() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-notion-lg">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-destructive/60" />
        <span className="h-3 w-3 rounded-full bg-warning/70" />
        <span className="h-3 w-3 rounded-full bg-success/70" />
        <div className="ml-4 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
          app.shipflow.ai/workflow
        </div>
      </div>

      {/* Board body */}
      <div className="bg-background p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            </span>
            <span className="font-display text-sm font-semibold text-foreground">Delivery pipeline</span>
          </div>
          <span className="hidden rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground sm:block">
            Sprint 14
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {pipelineCols.map((col) => (
            <div key={col.name} className="rounded-xl border border-border bg-secondary p-3">
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${col.accent}`} />
                <span className="text-xs font-medium text-muted-foreground">{col.name}</span>
                <span className="ml-auto text-xs text-muted-foreground/60">{col.cards.length}</span>
              </div>
              <div className="space-y-2">
                {col.cards.map((card) => (
                  <div
                    key={card}
                    className="rounded-lg border border-border bg-card p-2.5 shadow-notion transition-colors hover:border-primary/40"
                  >
                    <div className="text-xs font-medium text-foreground">{card}</div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="h-1 w-8 rounded-full bg-primary/50" />
                      <span className="h-1 w-5 rounded-full bg-border" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Logo Marquee ────────────────────────────────────── */

const logos = ["Vercel", "Linear", "Stripe", "Notion", "Figma", "Supabase", "Framer", "Raycast"];

function LogoMarquee() {
  return (
    <section className="relative border-y border-border bg-secondary py-14" aria-label="Trusted by teams">
      <p className="mb-8 text-center text-sm font-medium text-muted-foreground">
        Trusted by teams shipping at scale
      </p>
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="flex w-max animate-marquee items-center gap-16 pr-16">
          {[...logos, ...logos].map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="font-display text-2xl font-bold tracking-tight text-muted-foreground/50 transition-colors hover:text-foreground"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Bento Feature Grid ──────────────────────────────── */

type Feature = {
  title: string;
  description: string;
  icon: React.ReactNode;
  className: string;
  visual?: React.ReactNode;
};

const featureIcon = (path: React.ReactNode) => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" aria-hidden="true">
    {path}
  </svg>
);

const features: Feature[] = [
  {
    title: "AI PRD Generation",
    description:
      "Drop a rough idea and watch ShipFlow draft a complete product requirements document — scope, user stories, edge cases, and acceptance criteria included.",
    className: "lg:col-span-2 lg:row-span-2",
    icon: featureIcon(<path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 12.75v6.75A2.25 2.25 0 0117.25 21H6.75A2.25 2.25 0 014.5 18.75V8.25A2.25 2.25 0 016.75 6H13" />),
    visual: (
      <div className="mt-6 space-y-2.5 rounded-xl border border-border bg-secondary p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-accent-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-accent text-primary">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
          </span>
          Generating PRD…
        </div>
        <div className="h-2 w-3/4 rounded-full bg-border" />
        <div className="h-2 w-full rounded-full bg-border" />
        <div className="h-2 w-5/6 rounded-full bg-border" />
        <div className="h-2 w-2/3 rounded-full bg-primary/40" />
      </div>
    ),
  },
  {
    title: "Smart Task Breakdown",
    description:
      "Every PRD auto-decomposes into right-sized engineering tasks on a Kanban board, complete with estimates and dependencies.",
    className: "lg:col-span-1",
    icon: featureIcon(<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />),
  },
  {
    title: "GitHub Integration",
    description:
      "Link repos and ShipFlow tracks branches, commits, and pull requests against the right task automatically.",
    className: "lg:col-span-1",
    icon: featureIcon(<path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />),
  },
  {
    title: "AI Code Review",
    description:
      "Deep reviews that check your diff against the PRD, flag security issues, and suggest fixes — before a human ever looks.",
    className: "lg:col-span-2",
    icon: featureIcon(<path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />),
    visual: (
      <div className="mt-6 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          12 checks passed
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
          2 suggestions
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
          security · perf · style
        </span>
      </div>
    ),
  },
  {
    title: "Human Approval Gates",
    description:
      "Keep humans in the loop. Structured approvals make sure nothing ships without a final sign-off.",
    className: "lg:col-span-1",
    icon: featureIcon(<path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />),
  },
  {
    title: "Real-time Workflows",
    description:
      "Live status across every feature. The whole team sees movement from idea to ship the moment it happens.",
    className: "lg:col-span-1",
    icon: featureIcon(<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />),
  },
];

function BentoFeatures() {
  return (
    <section id="features" className="relative py-24 sm:py-32" aria-labelledby="features-heading">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="Platform"
          title={
            <>
              Everything you need to <span className="text-primary">ship</span>
            </>
          }
          description="One connected workflow from the first idea to the final deploy. No more stitching together six different tools."
        />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          variants={stagger}
          className="mt-16 grid auto-rows-[minmax(0,1fr)] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {features.map((f) => (
            <motion.article
              key={f.title}
              variants={scaleIn}
              className={`group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-notion transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-notion-lg ${f.className}`}
            >
              <div className="relative flex h-full flex-col">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary transition-colors duration-300">
                  {f.icon}
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold text-foreground">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
                {f.visual}
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Workflow Pipeline ───────────────────────────────── */

const steps = [
  { title: "Feature Request", desc: "Capture an idea from any channel" },
  { title: "PRD", desc: "AI drafts full requirements" },
  { title: "Tasks", desc: "Auto-split into engineering work" },
  { title: "Code", desc: "Build with GitHub linked" },
  { title: "AI Review", desc: "Checked against the spec" },
  { title: "Ship", desc: "Human approves, then deploy" },
];

function WorkflowPipeline() {
  return (
    <section id="workflow" className="relative overflow-hidden bg-secondary py-24 sm:py-32" aria-labelledby="workflow-heading">
      <div className="pointer-events-none absolute inset-0 bg-dot opacity-[0.4] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="Workflow"
          title={
            <>
              From idea to production, <span className="text-primary">automated</span>
            </>
          }
          description="Six stages, fully orchestrated. AI handles the busywork at every step while you stay in control of what ships."
        />

        <div className="relative mt-16">
          {/* soft connector line */}
          <div className="absolute left-0 right-0 top-[2.75rem] hidden h-px bg-border lg:block" aria-hidden="true" />

          <motion.ol
            initial="hidden"
            whileInView="visible"
            viewport={viewport}
            variants={stagger}
            className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6"
          >
            {steps.map((step, i) => (
              <motion.li key={step.title} variants={scaleIn} className="relative flex flex-col items-center text-center">
                <div className="relative z-10 flex h-[5.5rem] w-[5.5rem] flex-col items-center justify-center rounded-2xl border border-border bg-card shadow-notion transition-all duration-300 hover:border-primary/50 hover:shadow-notion-lg">
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[0.7rem] font-bold text-primary-foreground shadow-notion">
                    {i + 1}
                  </span>
                  <span className="text-primary">
                    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </span>
                </div>
                <h3 className="mt-4 font-display text-sm font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </div>
    </section>
  );
}

/* ─── Stats Band ──────────────────────────────────────── */

const stats = [
  { value: "10x", label: "Faster feature delivery" },
  { value: "95%", label: "AI review accuracy" },
  { value: "5min", label: "To your first PRD" },
  { value: "24/7", label: "Automated AI reviews" },
];

function StatsBand() {
  return (
    <section className="relative py-12 sm:py-20" aria-label="Key metrics">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          variants={stagger}
          className="grid grid-cols-2 gap-8 rounded-3xl border border-border bg-card px-8 py-12 shadow-notion lg:grid-cols-4"
        >
          {stats.map((s) => (
            <motion.div key={s.label} variants={fadeUp} className="text-center">
              <div className="font-display text-4xl font-extrabold tracking-tight text-primary sm:text-5xl">
                {s.value}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Pricing ─────────────────────────────────────────── */

const freeFeatures = [
  "10 AI reviews / month",
  "2 connected repositories",
  "PRD generation",
  "Kanban task board",
  "Community support",
];

const proFeatures = [
  "Unlimited AI reviews",
  "20 connected repositories",
  "Advanced security scanning",
  "Approval workflows & roles",
  "Real-time team collaboration",
  "Priority support",
];

function Check() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </span>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="relative py-24 sm:py-32" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="Pricing"
          title={
            <>
              Start free, <span className="text-primary">scale as you grow</span>
            </>
          }
          description="No credit card to begin. Upgrade the moment your team needs more horsepower."
        />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          variants={stagger}
          className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2"
        >
          {/* Free */}
          <motion.div
            variants={scaleIn}
            className="relative flex flex-col rounded-3xl border border-border bg-card p-8 shadow-notion transition-all duration-300 hover:-translate-y-1 hover:border-primary/30"
          >
            <h3 className="font-display text-lg font-semibold text-foreground">Free</h3>
            <p className="mt-1 text-sm text-muted-foreground">For individuals and side projects</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="font-display text-5xl font-bold text-foreground">₹0</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            <ul className="mt-8 flex-1 space-y-3.5" role="list">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-foreground/90">
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className="mt-8 block rounded-lg border border-border bg-card py-3 text-center text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-secondary"
            >
              Get started
            </Link>
          </motion.div>

          {/* Pro — highlighted */}
          <motion.div
            variants={scaleIn}
            className="relative flex flex-col rounded-3xl border-2 border-primary bg-accent/40 p-8 shadow-notion-lg transition-all duration-300 hover:-translate-y-1"
          >
            <span className="absolute -top-3 right-8 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-notion">
              Most Popular
            </span>
            <h3 className="font-display text-lg font-semibold text-foreground">Pro</h3>
            <p className="mt-1 text-sm text-muted-foreground">For growing engineering teams</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="font-display text-5xl font-bold text-foreground">₹4,999</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            <ul className="mt-8 flex-1 space-y-3.5" role="list">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-foreground/90">
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className="mt-8 block rounded-lg bg-primary py-3 text-center text-sm font-semibold text-primary-foreground shadow-notion transition-colors duration-200 hover:bg-primary/90"
            >
              Start Pro trial
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Big CTA ─────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="relative px-6 py-24 sm:py-32" aria-labelledby="cta-heading">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          variants={stagger}
          className="relative overflow-hidden rounded-[2rem] border border-border bg-accent px-8 py-20 text-center"
        >
          <div className="pointer-events-none absolute inset-0 bg-dot opacity-[0.4] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden="true" />

          <div className="relative">
            <motion.h2
              id="cta-heading"
              variants={fadeUp}
              className="mx-auto max-w-2xl font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl"
            >
              Start shipping <span className="text-primary">smarter</span> today
            </motion.h2>
            <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
              Join the teams turning ideas into shipped code with AI. Free to
              start, no credit card required.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="group inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground shadow-notion transition-colors duration-200 hover:bg-primary/90"
              >
                <span>Get started free</span>
                <svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-8 py-4 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-secondary"
              >
                Explore features
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Page ────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <>
      <Hero />
      <LogoMarquee />
      <BentoFeatures />
      <WorkflowPipeline />
      <StatsBand />
      <Pricing />
      <FinalCTA />
    </>
  );
}
