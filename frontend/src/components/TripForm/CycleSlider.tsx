import { ProgressBar, progressTone } from "../ui/ProgressBar"

interface Props {
  id: string
  label: string
  value: string
  cap: number
  onChange: (value: string) => void
  error?: string
}

const TONE_TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger" }
const TONE_WORD = { success: "Plenty left", warning: "Getting tight", danger: "Nearly exhausted" }

/** Slider + numeric input for cycle hours used. Both controls share one
 * value: the number input is the precise one, the slider the quick one.
 * Remaining hours show as a thresholded meter (green <70%, amber 70–90%,
 * red >90%) with a word, so the colour is never the only signal. */
export function CycleSlider({ id, label, value, cap, onChange, error }: Props) {
  const raw = value === "" ? 0 : Number(value)
  const n = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), cap) : 0
  const remaining = Math.max(cap - n, 0)
  const pct = cap > 0 ? (n / cap) * 100 : 0
  const tone = progressTone(n, cap)
  const rangeColor = tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--danger)"

  return (
    <div className={`rounded-xl border bg-surface-2 p-3.5 ${error ? "border-danger" : "border-line"}`}>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink-2">
          {label}
        </label>
        <div className="flex items-baseline gap-1.5">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            max={cap}
            step={0.5}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={`${id}-remaining${error ? ` ${id}-error` : ""}`}
            aria-invalid={!!error}
            className="num focus-ring w-[4.75rem] rounded-lg border border-line bg-surface px-2 py-1 text-right text-[15px] font-medium text-ink"
          />
          <span className="text-[13px] text-ink-3">/ {cap} h</span>
        </div>
      </div>
      <input
        type="range"
        className="cycle-range mt-2"
        min={0}
        max={cap}
        step={0.5}
        value={n}
        aria-label={`${label}, slider`}
        aria-valuetext={`${n} of ${cap} hours`}
        onChange={(e) => onChange(e.target.value)}
        style={{ ["--fill" as string]: `${pct}%`, ["--range-color" as string]: rangeColor }}
      />
      <ProgressBar value={n} max={cap} label={`${label} meter`} className="mt-1" />
      <div className="mt-1.5 flex items-center justify-between text-[13px]">
        <span id={`${id}-remaining`} className={`num font-medium ${TONE_TEXT[tone]}`}>
          {remaining % 1 === 0 ? remaining : remaining.toFixed(1)} h remaining · {TONE_WORD[tone]}
        </span>
        <span className="num text-ink-3">{Math.round(pct)}% used</span>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
