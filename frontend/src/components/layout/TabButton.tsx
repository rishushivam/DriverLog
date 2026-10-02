import { motion } from "framer-motion"
import type { ReactNode } from "react"
import { press, spring } from "../ui/motion"

interface Props {
  active: boolean
  onClick: () => void
  children: ReactNode
  /** Tabs sharing a group get one sliding indicator. */
  group: string
  id?: string
  controls?: string
}

export function TabButton({ active, onClick, children, group, id, controls }: Props) {
  return (
    <motion.button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
      whileTap={press}
      onClick={onClick}
      className={`focus-ring relative isolate rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-150 ${active ? "font-semibold text-accent-ink dark:text-ink" : "font-medium text-ink-2 hover:text-ink"}`}
    >
      {active && <motion.span layoutId={`tab-${group}`} transition={spring} className="absolute inset-0 z-0 rounded-lg bg-accent-300 shadow-[0_1px_2px_rgb(0_0_0/0.14)] dark:bg-accent-600/60" aria-hidden="true" />}
      <span className="relative z-10">{children}</span>
    </motion.button>
  )
}

export function TabList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1">
      {children}
    </div>
  )
}
