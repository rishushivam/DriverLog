import type { Transition, Variants } from "framer-motion"

/** One easing family for the whole surface: exponential ease-out. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const
export const spring: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 }
export const quick: Transition = { duration: 0.18, ease: EASE_OUT }

/** Results cards: slide up 8px + fade, staggered by the parent. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_OUT } },
}
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}

/** Progressive disclosure: height + fade. */
export const reveal: Variants = {
  collapsed: { height: 0, opacity: 0, overflow: "hidden", transition: { duration: 0.22, ease: EASE_OUT } },
  open: { height: "auto", opacity: 1, overflow: "visible", transition: { duration: 0.28, ease: EASE_OUT } },
}

/** Inline-validation shake. */
export const shake = { x: [0, -5, 5, -3, 3, 0], transition: { duration: 0.32 } }

/** "Haptic" press feedback on chips and buttons. */
export const press = { scale: 0.98 }
