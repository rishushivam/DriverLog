interface Props {
  id: string
  label: string
  value: string
  cap: number
  onChange: (value: string) => void
  error?: string
}

/** Slider + numeric input for cycle hours used, with the remaining budget
 * read out live. Both controls share one value; the number input is the
 * precise one, the slider the quick one. */
export function CycleSlider({ id, label, value, cap, onChange, error }: Props) {
  const n = value === "" ? 0 : Math.min(Math.max(Number(value), 0), cap)
  const remaining = Math.max(cap - n, 0)
  const pct = cap > 0 ? (n / cap) * 100 : 0
  const nearCap = remaining <= 10

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3.5">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
        <div className="flex items-baseline gap-1">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            max={cap}
            step={0.5}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={`${id}-remaining`}
            aria-invalid={!!error}
            className="num focus-ring w-[4.5rem] rounded-lg border border-line bg-surface px-2 py-1 text-right text-[15px] font-medium text-ink"
          />
          <span className="text-xs text-ink-3">hrs</span>
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
        onChange={(e) => onChange(e.target.value)}
        style={{ ["--fill" as string]: `${pct}%` }}
      />
      <div className="mt-0.5 flex items-center justify-between text-xs">
        <span id={`${id}-remaining`} className={`num font-medium ${nearCap ? "text-accent-700 dark:text-accent-300" : "text-ink-2"}`}>
          {remaining % 1 === 0 ? remaining : remaining.toFixed(1)} hrs remaining of {cap}
        </span>
        <span className="num text-ink-3">{Math.round(pct)}% used</span>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
