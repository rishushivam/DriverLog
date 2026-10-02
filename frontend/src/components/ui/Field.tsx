import { motion, useReducedMotion } from "framer-motion"
import type { InputHTMLAttributes, ReactNode } from "react"
import { shake } from "./motion"

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string
  label: string
  value: string
  error?: string
  hint?: ReactNode
  /** Suffix inside the field, e.g. "h". */
  unit?: string
  leading?: ReactNode
}

/** Floating-label input with inline validation. The label sits inside the
 * box until the field has content or focus, then lifts; a red helper and a
 * one-shot shake name an error. */
export function Field({ id, label, value, error, hint, unit, leading, className = "", ...rest }: Props) {
  const reduced = useReducedMotion()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <motion.div
        key={error ? "err" : "ok"}
        animate={error && !reduced ? shake : { x: 0 }}
        className={`float-field relative rounded-xl border bg-surface transition-[border-color,box-shadow] duration-150 focus-within:shadow-[0_0_0_4px_var(--accent-soft)] ${
          error ? "border-danger focus-within:border-danger" : "border-line hover:border-line-strong focus-within:border-accent"
        }`}
      >
        {leading && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">{leading}</span>}
        <input
          id={id}
          value={value}
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`peer num w-full rounded-xl bg-transparent px-3.5 pt-5 pb-1.5 text-[15px] text-ink outline-none placeholder:text-transparent ${leading ? "pl-9" : ""} ${unit ? "pr-12" : ""}`}
          {...rest}
        />
        <label
          htmlFor={id}
          className={`pointer-events-none absolute top-1/2 max-w-[calc(100%-3.5rem)] -translate-y-1/2 origin-left truncate text-sm whitespace-nowrap text-ink-2 transition-[transform,color] duration-150 ${leading ? "left-9" : "left-3.5"}`}
        >
          {label}
        </label>
        {unit && <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs font-medium text-ink-3">{unit}</span>}
      </motion.div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="px-1 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="px-1 text-[13px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
