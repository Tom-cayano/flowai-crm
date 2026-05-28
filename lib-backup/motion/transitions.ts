import { ease, spring } from "./easing";

// ─── Duration constants (ms → seconds for Framer Motion) ─────────────────────

export const dur = {
  micro:     0.08,
  fast:      0.15,
  std:       0.25,
  reveal:    0.5,
  cinematic: 0.8,
} as const;

// ─── Named transition presets ────────────────────────────────────────────────

export const transition = {
  // Hero text line reveal
  lineReveal: { duration: dur.cinematic, ease: ease.enter },
  lineRevealSlow: { duration: 0.7, ease: ease.enter },

  // Standard fade-up for sections
  fadeUp: { duration: dur.reveal, ease: ease.reveal },

  // Fast UI interaction
  ui: { duration: dur.fast, ease: ease.ui },

  // Hover state transitions
  hover: { duration: dur.std, ease: ease.ui },
  hoverFast: { duration: dur.fast, ease: ease.ui },

  // Spring entrances
  springBouncy: spring.bouncy,
  springSnappy: spring.snappy,
  springGentle: spring.gentle,

  // Ambient / loop
  ambient: { duration: 4, ease: "linear", repeat: Infinity } as const,
} as const;

// ─── Stagger helpers ──────────────────────────────────────────────────────────

export function staggerContainer(staggerDelay = 0.07, delayStart = 0) {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: staggerDelay, delayChildren: delayStart },
    },
  } as const;
}

// ─── Entrance animation delays (hero sequence) ───────────────────────────────

export const heroDelay = {
  badge:        0.05,
  headline1:    0.12,
  headline2:    0.20,
  headline3:    0.28,
  subheadline:  0.42,
  ctas:         0.54,
  trustStats:   0.68,
  channelOrbs:  0.90,
  mockup:       1.10,
  kpiCards:     1.60,
} as const;
