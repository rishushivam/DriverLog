import { useCountUp } from "../../hooks/useCountUp"
import type { TripResponse } from "../../api/types"

/** "31.8 hrs" reads as "how long the trip takes," which duration_hours
 * (pure distance/55mph) is not — this is trip_span_hours's job, formatted
 * as days+hours once it crosses a day so "55 hrs" doesn't have to be
 * mentally divided by 24 to see it's really "2d 7h". */
function formatSpan(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)} hrs`
  const days = Math.floor(hours / 24)
  const rest = hours - days * 24
  return `${days}d ${rest.toFixed(1)}h`
}

/** Reads like a form's own header line (think "TOTAL MILES DRIVING TODAY")
 * rather than a row of stat cards — labeled data pairs on one ruled strip.
 * Figures count up on arrival: a fast, specific acknowledgment that this
 * trip's numbers just landed, not decoration. */
export function SummaryStrip({ trip }: { trip: TripResponse }) {
  const distance = useCountUp(trip.route.distance_miles)
  const duration = useCountUp(trip.route.duration_hours)
  const span = useCountUp(trip.route.trip_span_hours)
  const days = useCountUp(trip.logs.length, 400)

  const fields: Array<[string, string]> = [
    ["Total distance", `${distance.toFixed(0)} mi`],
    ["Driving time", `${duration.toFixed(1)} hrs`],
    ["Trip completes in", formatSpan(span)],
    ["Trip length", `${Math.round(days)} ${trip.logs.length === 1 ? "day" : "days"}`],
  ]

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 border-y border-slate-300 bg-white px-5 py-3 shadow-sm">
      {fields.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
          <span className="tabular-nums text-base font-semibold text-navy-700">{value}</span>
        </div>
      ))}
    </div>
  )
}
