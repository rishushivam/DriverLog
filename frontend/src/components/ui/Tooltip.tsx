import { useId, useState, type ReactNode } from "react"

interface Props {
  label: ReactNode
  side?: "top" | "bottom" | "left" | "right"
  children: ReactNode
  className?: string
}

const POS = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
}

/** Hover/focus tooltip. The trigger keeps its own accessible name; the
 * tooltip is additional description (aria-describedby). */
export function Tooltip({ label, side = "top", children, className = "" }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute z-[70] w-max max-w-[240px] rounded-md bg-ink px-2 py-1 text-xs font-medium text-canvas shadow-[var(--shadow-3)] ${POS[side]}`}
        >
          {label}
        </span>
      )}
    </span>
  )
}
