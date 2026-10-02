import type { ButtonHTMLAttributes, ReactNode } from "react"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leading?: ReactNode
  trailing?: ReactNode
}

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-[15px]",
}
const VARIANT: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "border border-danger/40 bg-danger-soft text-danger-ink hover:border-danger",
}

export function Button({ variant = "secondary", size = "md", loading = false, leading, trailing, className = "", children, disabled, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`btn focus-ring ${SIZE[size]} ${VARIANT[variant]} ${className}`}
    >
      {loading ? <Spinner /> : leading}
      {children}
      {trailing}
    </button>
  )
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current ${className}`} />
}
