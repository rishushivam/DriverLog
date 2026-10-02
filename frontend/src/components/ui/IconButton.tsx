import type { ButtonHTMLAttributes } from "react"
import { Tooltip } from "./Tooltip"

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: "sm" | "md"
  active?: boolean
  /** Tooltip placement; the label is always available to assistive tech. */
  side?: "top" | "bottom" | "left" | "right"
}

/** Icon-only button: the visible tooltip and the aria-label are the same
 * string so sighted and screen-reader users read the same thing. */
export function IconButton({ label, size = "md", active = false, side = "bottom", className = "", children, ...rest }: Props) {
  return (
    <Tooltip label={label} side={side}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active || undefined}
        {...rest}
        className={`btn focus-ring ${size === "sm" ? "h-8 w-8" : "h-9 w-9"} rounded-lg border ${
          active ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
        } ${className}`}
      >
        {children}
      </button>
    </Tooltip>
  )
}
