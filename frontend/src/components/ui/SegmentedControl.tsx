import { motion } from "framer-motion"
import type { ReactNode } from "react"
import { spring } from "./motion"

interface Option<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Keep the label for assistive tech only. */
  hideLabel?: boolean
  disabled?: boolean
}

interface Props<T extends string> {
  name: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  "aria-label": string
  size?: "sm" | "md"
  className?: string
}

/** Radio group styled as a segmented control; the active indicator slides
 * between options via a shared layout animation. Arrow keys move between
 * options natively because each one is a real radio input. */
export function SegmentedControl<T extends string>({ name, value, options, onChange, size = "md", className = "", ...a11y }: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={a11y["aria-label"]}
      className={`relative grid w-full rounded-xl border border-line bg-surface-2 p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <label
            key={opt.value}
            title={opt.hideLabel ? opt.label : undefined}
            className={`relative isolate flex items-center justify-center gap-1.5 rounded-lg text-center font-medium transition-colors duration-150 select-none focus-within:outline-2 focus-within:outline-accent focus-within:outline-offset-2 ${
              opt.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            } ${size === "sm" ? "px-2 py-1.5 text-[13px] leading-tight" : "px-3 py-2 text-sm"} ${active ? "text-accent-ink dark:text-ink" : "text-ink-2 hover:text-ink"}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${name}`}
                transition={spring}
                className="absolute inset-0 z-0 rounded-lg bg-accent-300 shadow-[0_1px_2px_rgb(0_0_0/0.12)] dark:bg-accent-600/60"
                aria-hidden="true"
              />
            )}
            <input type="radio" name={name} value={opt.value} checked={active} disabled={opt.disabled} onChange={() => onChange(opt.value)} className="sr-only" />
            {opt.icon && <span className="relative z-10 flex items-center">{opt.icon}</span>}
            <span className={`relative z-10 ${opt.hideLabel ? "sr-only" : ""}`}>{opt.label}</span>
          </label>
        )
      })}
    </div>
  )
}
