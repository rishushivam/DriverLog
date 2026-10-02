import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"
import { press } from "./motion"

interface Props {
  label: string
  value: ReactNode
  open: boolean
  onToggle: () => void
  controls: string
}

/** A filled default rendered as a chip: the assumed value is visible at a
 * glance, with a small "Change" affordance that reveals the real control
 * underneath. Press feedback scales 0.98 → 1. */
export function Chip({ label, value, open, onToggle, controls }: Props) {
  return (
    <motion.button
      type="button"
      whileTap={press}
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={`focus-ring flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors duration-150 ${
        open ? "border-accent bg-accent-soft/60" : "border-line bg-surface-2 hover:border-line-strong"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-medium tracking-wide text-ink-3 uppercase">{label}</span>
        <span className="num block truncate text-[14px] font-medium text-ink">{value}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent-700 dark:text-accent-300">
        {open ? "Done" : "Change"}
        <ChevronDown size={14} strokeWidth={2.25} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </span>
    </motion.button>
  )
}
