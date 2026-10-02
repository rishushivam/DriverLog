import { motion, useReducedMotion } from "framer-motion"
import { AlertTriangle, ChevronDown, Truck } from "lucide-react"
import { useState } from "react"
import type { TripSegment } from "../../api/types"
import { STOP_COLORS, STOP_ICONS } from "../../config/stopTypes"
import { usePlaceName } from "../../hooks/usePlaceName"
import { useUnits } from "../../hooks/useUnits"
import { formatClock, formatDayLabel, formatDistance, formatDuration, formatMarker } from "../../model/format"
import { dayColor } from "../../model/routeGeometry"
import { describeSegment, isEnRouteLabel, type PlanDay, type TripPlan } from "../../model/tripPlan"
import { EASE_OUT } from "../ui/motion"

interface Props {
  plan: TripPlan
  /** Coordinates per stop segment index, for naming en-route stops. */
  stopCoords: Map<number, [number, number]>
  activeSegmentIndex: number | null
  onHover: (segmentIndex: number | null) => void
  onSelect: (segmentIndex: number) => void
}

const MIN_NOTABLE_HOURS = 0.05

/** "En route, mile 440" → "Near Murfreesboro, TN" with the marker as the
 * secondary line. Named stops keep their address. */
function PlaceLabel({ seg, coords }: { seg: TripSegment; coords: [number, number] | null }) {
  const { units } = useUnits()
  const enRoute = isEnRouteLabel(seg.location_label)
  const place = usePlaceName(enRoute ? coords : null, enRoute)
  const mile = /mile\s+(\d+)/i.exec(seg.location_label)?.[1]
  if (!enRoute) return <span className="block truncate text-[13px] text-ink-2">{seg.location_label}</span>
  return (
    <span className="block truncate text-[13px] text-ink-2">
      {place ? `Near ${place}` : place === null ? <span className="skeleton inline-block h-3 w-28 align-middle" aria-label="Looking up place name" /> : "En route"}
      {mile && <span className="num text-ink-3"> · {formatMarker(Number(mile), units)}</span>}
    </span>
  )
}

function DayBar({ day }: { day: PlanDay }) {
  const total = Math.max(day.driveHours + day.onDutyHours + day.restHours, 0.01)
  const pct = (h: number) => `${(h / total) * 100}%`
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-line" role="img" aria-label={`Day ${day.index + 1}: ${day.driveHours.toFixed(1)} h driving, ${day.onDutyHours.toFixed(1)} h on duty, ${day.restHours.toFixed(1)} h rest`}>
      <span className="h-full bg-ink" style={{ width: pct(day.driveHours) }} />
      <span className="h-full bg-warning" style={{ width: pct(day.onDutyHours) }} />
      <span className="h-full bg-info/60" style={{ width: pct(day.restHours) }} />
    </div>
  )
}

/** Vertical stepper of the whole route grouped by calendar day. Each day
 * header is sticky inside the scroll region, collapsible, and carries a
 * drive / on-duty / rest bar plus the day's miles. Hovering a step
 * highlights the same event on the map and the log grid. */
export function RouteTimeline({ plan, stopCoords, activeSegmentIndex, onHover, onSelect }: Props) {
  const reduced = useReducedMotion()
  const { units } = useUnits()
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  let order = 0

  return (
    <div className="card flex min-h-0 flex-col">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
        <h3 className="text-sm font-semibold text-ink">Route timeline</h3>
        <span className="num text-xs text-ink-3">{plan.stopCount} required stops</span>
      </div>
      <div className="flex items-center gap-4 border-b border-line px-5 py-2 text-xs text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-ink" aria-hidden="true" /> Drive
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-warning" aria-hidden="true" /> On duty
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-info/60" aria-hidden="true" /> Rest
        </span>
      </div>
      <ol className="scroll-thin fade-edges relative max-h-[640px] overflow-y-auto px-4 pt-3 pb-5 xl:max-h-[calc(100dvh-14rem)]" aria-label="Timeline by day">
        {plan.days.map((day) => {
          const isCollapsed = !!collapsed[day.index]
          const color = dayColor(day.index)
          return (
            <li key={day.date} className="mb-2 last:mb-0">
              <div className="sticky top-0 z-10 -mx-1 bg-surface/95 px-1 pt-1 pb-2 backdrop-blur">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [day.index]: !c[day.index] }))}
                  aria-expanded={!isCollapsed}
                  aria-controls={`timeline-day-${day.index}`}
                  className="focus-ring flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1 py-1 text-left hover:bg-surface-2"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
                  <span className="text-[13px] font-semibold whitespace-nowrap text-ink">
                    Day {day.index + 1} <span className="font-medium text-ink-3">· {formatDayLabel(day.date)}</span>
                  </span>
                  {day.status === "warning" && (
                    <span className="flex items-center gap-1 text-xs text-warning" title={day.statusNote ?? undefined}>
                      <AlertTriangle size={12} aria-hidden="true" />
                      <span className="sr-only">{day.statusNote}</span>
                    </span>
                  )}
                  <span className="num ml-auto flex shrink-0 items-center gap-2 text-xs whitespace-nowrap text-ink-3">
                    <span title="Driving">{day.driveHours.toFixed(1)} h drv</span>
                    <span title="On duty, not driving">{day.onDutyHours.toFixed(1)} h duty</span>
                    <span title="Distance">{formatDistance(day.miles, units)}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`} aria-hidden="true" />
                  </span>
                </button>
                <div className="px-1 pt-1">
                  <DayBar day={day} />
                </div>
              </div>
              {!isCollapsed && (
                <ol id={`timeline-day-${day.index}`} className="relative ml-[13px] border-l border-line pl-5">
                  {day.segments
                    .filter(({ seg, hours }) => seg.stop_type !== null || hours > MIN_NOTABLE_HOURS)
                    .map(({ seg, index, hours, miles }) => {
                      const i = order++
                      const { label, reason } = describeSegment(plan, seg)
                      const Icon = seg.stop_type ? STOP_ICONS[seg.stop_type] : Truck
                      const stopColor = seg.stop_type ? STOP_COLORS[seg.stop_type] : "var(--ink-3)"
                      const isActive = activeSegmentIndex === index
                      const isDrive = !seg.stop_type && seg.status === "DRIVING"
                      return (
                        <motion.li
                          key={index}
                          id={`timeline-seg-${index}`}
                          initial={reduced ? false : { opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.32, ease: EASE_OUT, delay: Math.min(i * 0.04, 0.8) }}
                          className="relative pb-2 last:pb-0"
                        >
                          <span
                            aria-hidden="true"
                            className={`absolute top-2 -left-[31px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-surface transition-transform duration-150 ${isActive ? "scale-110" : ""}`}
                            style={{ backgroundColor: isDrive ? "var(--surface-3)" : stopColor, boxShadow: isActive ? `0 0 0 3px ${isDrive ? "var(--line-strong)" : stopColor}55` : undefined }}
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
                            className={`focus-ring flex w-full items-start justify-between gap-3 rounded-xl px-3 text-left transition-colors duration-150 ${isActive ? "bg-accent-soft/70" : "hover:bg-surface-2"} ${isDrive ? "py-1.5" : "py-2"}`}
                          >
                            <span className="min-w-0">
                              <span className={`block truncate font-medium text-ink ${isDrive ? "text-[13px]" : "text-sm"}`}>
                                {label}
                                {isDrive && <span className="num font-normal text-ink-3"> · {formatDistance(miles, units)}</span>}
                              </span>
                              <PlaceLabel seg={seg} coords={stopCoords.get(index) ?? null} />
                              {!isDrive && reason && <span className="mt-0.5 block text-xs leading-snug text-ink-3">{reason}</span>}
                            </span>
                            <span className="num shrink-0 text-right text-xs text-ink-2">
                              <span className="block font-medium text-ink">
                                {formatClock(seg.start_datetime)}
                                <span className="text-ink-3"> – </span>
                                {formatClock(seg.end_datetime)}
                              </span>
                              <span className="block text-ink-3">{formatDuration(hours)}</span>
                            </span>
                          </button>
                        </motion.li>
                      )
                    })}
                </ol>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
