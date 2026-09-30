import { useEffect, useState } from "react"
import { Check } from "lucide-react"

const STEPS = [
  { label: "Validating locations", atMs: 0 },
  { label: "Calculating route", atMs: 900 },
  { label: "Applying HOS rules and building logs", atMs: 2600 },
]

/** The actual request is one opaque round trip — there's no server-sent
 * progress to report. Advancing these steps on elapsed time (rather than
 * real signals) is disclosed by design: each step names real, sequential
 * work the backend does in this order, so the wait reads as "the tool is
 * doing something specific" instead of a spinner with no story. */
function useElapsedMs(active: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const id = setInterval(() => setElapsed(Date.now() - start), 150)
    return () => clearInterval(id)
  }, [active])
  return elapsed
}

export function LoadingPanel({ isSlow }: { isSlow: boolean }) {
  const elapsed = useElapsedMs(!isSlow)
  const currentStep = STEPS.reduce((acc, step, i) => (elapsed >= step.atMs ? i : acc), 0)

  return (
    <div className="animate-reveal rounded-md border border-slate-300 bg-white p-6 shadow-sm">
      {isSlow ? (
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-navy-600" />
          <p className="text-sm text-slate-600">
            Waking up the server — this can take up to a minute on the first request after a period of inactivity.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {STEPS.map((step, i) => {
            const done = i < currentStep
            const active = i === currentStep
            return (
              <li key={step.label} className="flex items-center gap-2.5 text-sm">
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    done
                      ? "border-navy-600 bg-navy-600"
                      : active
                        ? "border-navy-500"
                        : "border-slate-300"
                  }`}
                >
                  {done ? (
                    <Check size={10} strokeWidth={3} className="text-white" />
                  ) : active ? (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-navy-500" />
                  ) : null}
                </span>
                <span className={done || active ? "text-slate-800" : "text-slate-500"}>{step.label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
