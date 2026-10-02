import { motion, useReducedMotion } from "framer-motion"
import { Truck } from "lucide-react"
import type { TripResponse, TripSegment } from "../../api/types"
import { STOP_COLORS, STOP_ICONS, STOP_LABELS, STOP_REASONS, restartLabel, restartReason } from "../../config/stopTypes"
import { formatClock, formatDuration, groupSegmentsByDay, segmentDurationHours } from "../../utils/tripSegments"
import { EASE_OUT } from "../ui/motion"

interface Props {
  trip: TripResponse
  activeSegmentIndex: number | null
  onHover: (segmentIndex: number | null) => void
  onSelect: (segmentIndex: number) => void
}

const MIN_NOTABLE_HOURS = 0.05

/** Vertical stepper of the whole route: drive legs and every required
 * stop, each with its time window and the HOS reason behind it. The spine
 * draws in progressively on arrival; hovering a step highlights the same
 * event on the map and the log grid. */
export function RouteTimeline({ trip, activeSegmentIndex, onHover, onSelect }: Props) {
  const reduced = useReducedMotion()
  const days = groupSegmentsByDay(trip.segments)

  const describe = (seg: TripSegment) => {
    if (seg.stop_type === "restart") {
      return { label: restartLabel(trip.restart_hours), reason: restartReason(trip.restart_hours, trip.cycle_schedule, trip.cycle_cap_hours, trip.cycle_cap_days) }
    }
    if (seg.stop_type) return { label: STOP_LABELS[seg.stop_type], reason: seg.remark && seg.stop_type === "cycle_wait" ? seg.remark : STOP_REASONS[seg.stop_type] }
    if (seg.status === "DRIVING") {
      return { label: "Drive", reason: `${(seg.odometer_end_miles - seg.odometer_start_miles).toFixed(0)} mi at 55 mph` }
    }
    return { label: seg.status === "OFF_DUTY" ? "Off duty" : seg.status === "SLEEPER_BERTH" ? "Sleeper berth" : "On duty", reason: seg.remark ?? "" }
  }

  let order = 0
  return (
    <div className="rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
        <h3 className="text-sm font-semibold text-ink">Route timeline</h3>
        <span className="text-xs text-ink-3">{trip.segments.filter((s) => s.stop_type).length} required stops</span>
      </div>
      <ol className="scroll-thin max-h-[560px] overflow-y-auto px-5 py-4">
        {days.map((day, dayIdx) => (
          <li key={day.date} className={dayIdx > 0 ? "mt-5" : undefined}>
            <div className="num mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
              <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-ink-2">Day {dayIdx + 1}</span>
              {day.date}
            </div>
            <ol className="relative ml-[13px] border-l border-line pl-5">
              {day.segments
                .filter(({ seg }) => seg.stop_type !== null || segmentDurationHours(seg) > MIN_NOTABLE_HOURS)
                .map(({ seg, index }) => {
                  const i = order++
                  const { label, reason } = describe(seg)
                  const Icon = seg.stop_type ? STOP_ICONS[seg.stop_type] : Truck
                  const color = seg.stop_type ? STOP_COLORS[seg.stop_type] : "var(--ink-3)"
                  const isActive = activeSegmentIndex === index
                  const isDrive = !seg.stop_type && seg.status === "DRIVING"
                  return (
                    <motion.li
                      key={index}
                      initial={reduced ? false : { opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.32, ease: EASE_OUT, delay: Math.min(i * 0.05, 0.9) }}
                      className="relative pb-3 last:pb-0"
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute top-2 -left-[31px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-surface transition-transform duration-150 ${isActive ? "scale-110" : ""}`}
                        style={{ backgroundColor: isDrive ? "var(--surface-3)" : color, boxShadow: isActive ? `0 0 0 3px ${isDrive ? "var(--line-strong)" : color}33` : undefined }}
                      >
                        <Icon size={11} strokeWidth={2.5} color={isDrive ? "var(--ink-2)" : "white"} />
                      </span>
                      <button
                        type="button"
                        onMouseEnter={() => onHover(index)}
                        onMouseLeave={() => onHover(null)}
                        onFocus={() => onHover(index)}
                        onBlur={() => onHover(null)}
                        onClick={() => onSelect(index)}
                        aria-pressed={isActive}
                        aria-label={`${label}, ${formatClock(seg.start_datetime)} to ${formatClock(seg.end_datetime)}, ${seg.location_label}`}
                        className={`focus-ring flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150 ${
                          isActive ? "bg-accent-soft/70" : "hover:bg-surface-2"
                        } ${isDrive ? "py-1.5" : ""}`}
                      >
                        <span className="min-w-0">
                          <span className={`block truncate font-medium text-ink ${isDrive ? "text-[13px]" : "text-sm"}`}>{label}</span>
                          <span className="block truncate text-xs text-ink-2">{seg.location_label}</span>
                          {!isDrive && reason && <span className="mt-0.5 block text-xs leading-snug text-ink-3">{reason}</span>}
                        </span>
                        <span className="num shrink-0 text-right text-xs text-ink-2">
                          <span className="block font-medium text-ink">
                            {formatClock(seg.start_datetime)}
                            <span className="text-ink-3"> – </span>
                            {formatClock(seg.end_datetime)}
                          </span>
                          <span className="block text-ink-3">{formatDuration(segmentDurationHours(seg))}</span>
                        </span>
                      </button>
                    </motion.li>
                  )
                })}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  )
}
