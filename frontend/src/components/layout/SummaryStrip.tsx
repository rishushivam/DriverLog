import { motion } from "framer-motion"
import { AlertTriangle, ShieldCheck } from "lucide-react"
import type { TripResponse } from "../../api/types"
import { useCountUp } from "../../hooks/useCountUp"
import { rise } from "../ui/motion"

function formatSpan(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)} h`
  const days = Math.floor(hours / 24)
  const rest = hours - days * 24
  return `${days}d ${rest.toFixed(1)}h`
}

/** Compliance badge. The engine never emits an illegal plan, so the trip
 * is always compliant; "Needs review" flags the cases a dispatcher should
 * read before dispatching: a restart or a cycle wait on the route, a
 * trip that stretches past five calendar days, or hours that came in
 * from a mid-shift driver (the plan starts with a break they may already
 * have taken). */
export function complianceStatus(trip: TripResponse): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (trip.segments.some((s) => s.stop_type === "restart")) reasons.push(`includes a ${trip.restart_hours}-hr restart`)
  if (trip.segments.some((s) => s.stop_type === "cycle_wait")) reasons.push("waits for cycle hours to age off")
  if (trip.logs.length > 5) reasons.push(`${trip.logs.length} log days`)
  if (trip.driving_hours_today > 0 || trip.on_duty_hours_today > 0) reasons.push("driver was mid-shift at departure")
  if (trip.operating_mode !== "standard" && !trip.exception_applied) {
    reasons.push(`short-haul exception not available (${(trip.exception_reasons ?? []).join("; ") || "conditions not met"}) — planned under §395.3 instead`)
  }
  if (trip.use_16_hour_exception) reasons.push(trip.exception_applied ? "16-hour exception used today (§395.1(o))" : "16-hour exception enabled but not needed")
  return { ok: reasons.length === 0, reasons }
}

export function SummaryStrip({ trip }: { trip: TripResponse }) {
  const distance = useCountUp(trip.route.distance_miles)
  const duration = useCountUp(trip.route.duration_hours)
  const span = useCountUp(trip.route.trip_span_hours)
  const days = trip.logs.length
  const status = complianceStatus(trip)

  const figures: Array<[string, string]> = [
    ["Distance", `${distance.toFixed(0)} mi`],
    ["Drive time", `${duration.toFixed(1)} h`],
    ["Total trip", formatSpan(span)],
    ["Days", `${days} ${days === 1 ? "day" : "days"}`],
  ]

  return (
    <motion.section variants={rise} aria-label="Trip summary" className="rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          {figures.map(([label, value]) => (
            <div key={label} className="min-w-[88px]">
              <dt className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">{label}</dt>
              <dd className="num mt-0.5 text-lg font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="ml-auto">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              status.ok
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                : "border-accent-300 bg-accent-soft text-accent-800 dark:border-accent-600 dark:text-accent-200"
            }`}
            title={status.ok ? "No restart, no cycle wait, and a fresh clock at departure." : status.reasons.join("; ")}
          >
            {status.ok ? <ShieldCheck size={14} strokeWidth={2.25} aria-hidden="true" /> : <AlertTriangle size={14} strokeWidth={2.25} aria-hidden="true" />}
            {status.ok ? "Compliant" : "Needs review"}
          </span>
        </div>
      </div>
      {!status.ok && (
        <p className="border-t border-line px-5 py-2.5 text-xs text-ink-2">
          Review before dispatch: <span className="text-ink">{status.reasons.join(" · ")}</span>. The plan itself stays within Part 395.
        </p>
      )}
    </motion.section>
  )
}
