"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";

/* ─── Brand mark ──────────────────────────────────────── */

function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2.5 ${className ?? ""}`}
      aria-label="ShipFlow home"
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-glow transition-transform group-hover:scale-105">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </span>
      <span className="font-display text-xl font-bold tracking-tight text-foreground">
        ShipFlow
      </span>
    </Link>
  );
}

/* ─── Testimonials + feature highlights for the brand panel ─── */

const HIGHLIGHTS = [
  {
    quote:
      "ShipFlow turned our messy backlog into shipped features. The AI reviews catch what we miss.",
    name: "Maya Chen",
    role: "Head of Engineering, Northwind",
  },
  {
    quote:
      "From feature request to production in a single, auditable flow. Approval gates give us total confidence.",
    name: "Daniel Ortiz",
    role: "VP Product, Lumen Labs",
  },
];

const FEATURES = [
  "AI-powered code reviews on every change",
  "Structured workflows with human approval gates",
  "From idea to shipped code, fully auditable",
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full lg:grid lg:grid-cols-[45fr_55fr]">
      {/* ─── LEFT: brand panel (desktop only) ─── */}
      <aside className="relative hidden overflow-hidden bg-[#050c08] lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* grid texture */}
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(26,46,32,0.6) 1px,transparent 1px),linear-gradient(90deg,rgba(26,46,32,0.6) 1px,transparent 1px)", backgroundSize: "52px 52px" }} aria-hidden="true" />
        <div
          className="bg-aurora pointer-events-none absolute -left-32 -top-24 h-[28rem] w-[28rem] opacity-60"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-20 right-0 h-72 w-72 rounded-full bg-[hsl(var(--brand-to)/0.16)] blur-[120px]"
          aria-hidden="true"
        />

        {/* Logo */}
        <div className="relative z-10">
          <Logo />
        </div>

        {/* Headline + value prop */}
        <div className="relative z-10 max-w-lg">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-foreground xl:text-5xl"
          >
            Ship features with{" "}
            <span className="text-brand-gradient">confidence</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="mt-5 text-lg leading-relaxed text-muted-foreground"
          >
            The AI-powered delivery platform that turns feature requests into
            shipped code through structured, auditable workflows.
          </motion.p>

          {/* Feature highlights */}
          <motion.ul
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="mt-8 space-y-3"
          >
            {FEATURES.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-3 text-sm text-foreground/80"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                {feature}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* Testimonial cards */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative z-10 space-y-4"
        >
          {HIGHLIGHTS.map((item) => (
            <figure
              key={item.name}
              className="rounded-xl border border-border bg-card p-5 shadow-notion"
            >
              <blockquote className="text-sm leading-relaxed text-foreground/80">
                &ldquo;{item.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                  {item.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </span>
                <span className="text-xs">
                  <span className="block font-medium text-foreground">
                    {item.name}
                  </span>
                  <span className="block text-muted-foreground">{item.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </motion.div>
      </aside>

      {/* ─── RIGHT: auth surface ─────────────────────────── */}
      <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-6">
        {/* Mobile logo header */}
        <div className="relative z-10 mb-8 flex justify-center lg:hidden">
          <Logo />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative z-10 w-full max-w-md"
        >
          {children}
        </motion.div>

        <p className="relative z-10 mt-8 text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <Link
            href="/terms"
            className="text-foreground/70 underline-offset-4 hover:underline"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="text-foreground/70 underline-offset-4 hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
