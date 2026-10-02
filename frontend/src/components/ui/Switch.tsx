import { motion } from "framer-motion"
import type { ReactNode } from "react"

interface Props {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
}

export function Switch({ id, checked, onChange, label, hint, disabled }: Props) {
  return (
    <label htmlFor={id} className={`flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] text-ink-3">{hint}</span>}
      </span>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`focus-ring relative mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border px-0.5 transition-colors duration-150 ${
          checked ? "border-accent bg-accent" : "border-line-strong bg-surface-3"
        }`}
      >
        <motion.span layout transition={{ type: "spring", stiffness: 520, damping: 34 }} className={`h-4.5 w-4.5 rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.3)] ${checked ? "ml-auto" : ""}`} />
      </button>
    </label>
  )
}
