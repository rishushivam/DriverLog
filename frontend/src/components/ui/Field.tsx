import { motion, useReducedMotion } from "framer-motion"
import { Check } from "lucide-react"
import type { InputHTMLAttributes, ReactNode } from "react"
import { shake } from "./motion"

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string
  label: string
  value: string
  error?: string
  hint?: ReactNode
  /** Show the green check when the field holds a valid value. */
  valid?: boolean
  /** Suffix inside the field, e.g. "hrs". */
  unit?: string
  leading?: ReactNode
}

/** Floating-label input with inline validation. The label sits inside the
 * box until the field has content or focus, then lifts; a red helper and a
 * one-shot shake name an error; a green check confirms a valid value. */
export function Field({ id, label, value, error, hint, valid, unit, leading, className = "", ...rest }: Props) {
  const reduced = useReducedMotion()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <motion.div
        key={error ? "err" : "ok"}
        animate={error && !reduced ? shake : { x: 0 }}
        className={`float-field relative rounded-xl border bg-surface transition-[border-color,box-shadow] duration-150 focus-within:shadow-[0_0_0_4px_var(--accent-soft)] ${
          error
            ? "border-red-400 focus-within:border-red-500"
            : "border-line hover:border-line-strong focus-within:border-accent"
        }`}
      >
        {leading && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">{leading}</span>}
        <input
          id={id}
          value={value}
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`peer num w-full rounded-xl bg-transparent px-3.5 pt-5 pb-1.5 text-[15px] text-ink outline-none placeholder:text-transparent ${
            leading ? "pl-9" : ""
          } ${unit || valid ? "pr-12" : ""}`}
          {...rest}
        />
        <label
          htmlFor={id}
          className={`pointer-events-none absolute top-1/2 max-w-[calc(100%-3.5rem)] -translate-y-1/2 origin-left truncate text-[14px] whitespace-nowrap text-ink-2 transition-[transform,color] duration-150 ${
            leading ? "left-9" : "left-3.5"
          }`}
        >
          {label}
        </label>
        {unit && (
          <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs font-medium text-ink-3">{unit}</span>
        )}
        {valid && !error && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400 ${unit ? "right-11" : "right-3.5"}`}
            aria-hidden="true"
          >
            <Check size={15} strokeWidth={2.5} />
          </motion.span>
        )}
      </motion.div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="px-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="px-1 text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
