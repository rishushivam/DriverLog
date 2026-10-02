interface Props {
  value: number
  max: number
  label: string
  /** Colour thresholds as fractions of max: [amberAt, redAt]. */
  thresholds?: [number, number]
  className?: string
}

export function progressTone(value: number, max: number, thresholds: [number, number] = [0.7, 0.9]): "success" | "warning" | "danger" {
  const pct = max > 0 ? value / max : 0
  if (pct > thresholds[1]) return "danger"
  if (pct >= thresholds[0]) return "warning"
  return "success"
}

const TONE_BG = { success: "bg-success", warning: "bg-warning", danger: "bg-danger" }

/** Meter with colour thresholds (green <70%, amber 70–90%, red >90%). The
 * tone is also exposed as a data attribute so labels can echo it in text. */
export function ProgressBar({ value, max, label, thresholds = [0.7, 0.9], className = "" }: Props) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const tone = progressTone(value, max, thresholds)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 10) / 10}
      data-tone={tone}
      className={`h-2 w-full overflow-hidden rounded-full bg-line ${className}`}
    >
      <div className={`h-full rounded-full transition-[width,background-color] duration-200 ${TONE_BG[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
