import { motion } from "framer-motion"
import { spring } from "./motion"

interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  name: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  "aria-label": string
  size?: "sm" | "md"
}

/** Radio group styled as a segmented control; the active indicator slides
 * between options via a shared layout animation. */
export function SegmentedControl<T extends string>({ name, value, options, onChange, size = "md", ...a11y }: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={a11y["aria-label"]}
      className="relative grid w-full rounded-xl border border-line bg-surface-2 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <label
            key={opt.value}
            className={`relative isolate flex cursor-pointer items-center justify-center rounded-lg text-center font-medium transition-colors duration-150 select-none focus-within:outline-2 focus-within:outline-accent focus-within:outline-offset-2 ${
              size === "sm" ? "px-1.5 py-1.5 text-[12px] leading-tight" : "px-3 py-2 text-sm"
            } ${active ? "text-accent-ink dark:text-ink" : "text-ink-2 hover:text-ink"}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${name}`}
                transition={spring}
                className="absolute inset-0 z-0 rounded-lg bg-accent-300 shadow-[0_1px_2px_rgb(0_0_0/0.12)] dark:bg-accent-600/60"
                aria-hidden="true"
              />
            )}
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={active}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <span className="relative z-10">{opt.label}</span>
          </label>
        )
      })}
    </div>
  )
}
