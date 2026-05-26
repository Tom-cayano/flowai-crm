// Unified easing curves for FlowAI landing animations.
// All values are cubic-bezier arrays compatible with Framer Motion's `ease` prop.

export const ease = {
  // Gentle spring-like overshoot — hero text reveals, card entrances
  enter:   [0.21, 1.02, 0.73, 0.98] as const,
  // Standard UI — hover states, toggles, dropdowns
  ui:      [0.4,  0,    0.2,  1   ] as const,
  // Dramatic reveal — section entrances, large elements falling in
  reveal:  [0.16, 1,    0.3,  1   ] as const,
  // Exit — elements leaving the screen
  exit:    [0.55, 0,    1,    0.45] as const,
  // Smooth in-out — parallax, ambient movement
  smooth:  [0.4,  0,    0.6,  1   ] as const,
} as const;

export type EasingKey = keyof typeof ease;

// Framer Motion spring configs
export const spring = {
  // Snappy — button presses, toggles
  snappy:  { type: "spring", stiffness: 500, damping: 40 } as const,
  // Bouncy — card entrances, floating elements settling
  bouncy:  { type: "spring", stiffness: 400, damping: 30 } as const,
  // Gentle — modals, large panels
  gentle:  { type: "spring", stiffness: 280, damping: 38 } as const,
  // Slow   — parallax followers, mouse-track elements
  slow:    { type: "spring", stiffness: 120, damping: 20 } as const,
} as const;
