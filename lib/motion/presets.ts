// Reusable Framer Motion variant objects for FlowAI landing.
// Import these into any component to keep animation logic DRY.

import { ease, spring } from "./easing";

// ─── Clip-path line reveal (hero headlines) ───────────────────────────────────
// Wrapper div must have overflow:hidden for this to work.

export const lineReveal = {
  hidden:  { y: "110%", opacity: 0 },
  visible: { y: "0%",   opacity: 1,
    transition: { duration: 0.65, ease: ease.enter },
  },
} as const;

export const lineRevealSlow = {
  hidden:  { y: "110%", opacity: 0 },
  visible: { y: "0%",   opacity: 1,
    transition: { duration: 0.75, ease: ease.enter },
  },
} as const;

// ─── Standard fade-up (sections, cards) ──────────────────────────────────────

export const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0,
    transition: { duration: 0.55, ease: ease.reveal },
  },
} as const;

export const fadeUpSm = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0,
    transition: { duration: 0.45, ease: ease.reveal },
  },
} as const;

// ─── Fade-in only (subheadline, utility text) ─────────────────────────────────

export const fadeIn = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1,
    transition: { duration: 0.5, ease: ease.ui },
  },
} as const;

// ─── Scale-in spring (channel orbs, floating cards) ──────────────────────────

export const scaleIn = {
  hidden:  { opacity: 0, scale: 0.82 },
  visible: { opacity: 1, scale: 1,
    transition: spring.bouncy,
  },
} as const;

// ─── Mockup entrance (opacity + translateY + 3D tilt via CSS) ────────────────

export const mockupEntrance = {
  hidden:  { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0,
    transition: { duration: 0.85, ease: ease.reveal },
  },
} as const;

// ─── Message bubble (chat window messages arriving) ───────────────────────────

export const messageBubble = {
  hidden:  { opacity: 0, scale: 0.88, y: 8 },
  visible: { opacity: 1, scale: 1,    y: 0,
    transition: spring.snappy,
  },
} as const;

// ─── Stagger containers ───────────────────────────────────────────────────────

export const staggerFast = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.06 } },
} as const;

export const staggerMed = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
} as const;

export const staggerSlow = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
} as const;
