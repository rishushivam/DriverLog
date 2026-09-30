import type { DutyStatus, TripSegment } from "../../api/types"
import { STOP_COLORS, STOP_ICONS, STOP_LABELS, restartLabel } from "../../config/stopTypes"
import { formatClock, formatDuration, groupSegmentsByDay, segmentDurationHours } from "../../utils/tripSegments"

const STATUS_LABELS: Record<DutyStatus, string> = {
  DRIVING: "Drive",
  OFF_DUTY: "Off duty",
  SLEEPER_BERTH: "Sleeper berth",
  ON_DUTY_NOT_DRIVING: "On duty",
}

const STATUS_DOT: Record<DutyStatus, string> = {
  DRIVING: "#1b2a47",
  OFF_DUTY: "#94a3b8",
  SLEEPER_BERTH: "#2563eb",
  ON_DUTY_NOT_DRIVING: "#d97706",
}

/** Below a short duration threshold a driving leg is a connective tissue
 * segment (the minutes between two stops), not an event worth its own row —
 * collapsing it keeps the eye on stops and meaningful drive legs instead of
 * scrolling past dozens of few-minute slivers the engine emits at every
 * status change. */
const MIN_NOTABLE_HOURS = 0.05

interface Props {
  segments: TripSegment[]
  activeSegmentIndex: number | null
  onHover: (segmentIndex: number | null) => void
  onSelect: (segmentIndex: number) => void
  /** Only the "restart" row label depends on this — a trip can override
   * the regulatory 34-hour default (see `restart_hours` on `TripResponse`). */
  restartHours: number
}

export function TripTimeline({ segments, activeSegmentIndex, onHover, onSelect, restartHours }: Props) {
  const days = groupSegmentsByDay(segments)
  const labelFor = (seg: TripSegment) =>
    seg.stop_type ? (seg.stop_type === "restart" ? restartLabel(restartHours) : STOP_LABELS[seg.stop_type]) : STATUS_LABELS[seg.status]

  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Timeline</h3>
      <div className="eld-scroll max-h-[520px] overflow-y-auto rounded-sm border border-slate-300 bg-white p-3">
        {days.map((day, dayIdx) => (
          <div key={day.date} className={dayIdx > 0 ? "mt-4" : undefined}>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Day {dayIdx + 1} · {day.date}
            </div>
            <ol>
              {day.segments
                .filter(({ seg }) => seg.stop_type !== null || segmentDurationHours(seg) > MIN_NOTABLE_HOURS)
                .map(({ seg, index }, i, arr) => {
                  const durationHours = segmentDurationHours(seg)
                  const isActive = activeSegmentIndex === index
                  const Icon = seg.stop_type ? STOP_ICONS[seg.stop_type] : null
                  const dotColor = seg.stop_type ? STOP_COLORS[seg.stop_type] : STATUS_DOT[seg.status]
                  const isLast = i === arr.length - 1
                  return (
                    <li key={index} className="relative flex gap-3 pb-3 last:pb-0">
                      {!isLast && <span className="absolute top-5 left-[9px] h-full w-px bg-slate-200" aria-hidden="true" />}
                      <button
                        type="button"
                        onMouseEnter={() => onHover(index)}
                        onMouseLeave={() => onHover(null)}
                        onFocus={() => onHover(index)}
                        onBlur={() => onHover(null)}
                        onClick={() => onSelect(index)}
                        className="relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border-2 border-white ring-1 ring-slate-300 transition-transform duration-150"
                        style={{ backgroundColor: isActive ? dotColor : "white" }}
                        aria-label={`${labelFor(seg)} at ${formatClock(seg.start_datetime)}`}
                      >
                        {Icon ? (
                          <Icon size={10} strokeWidth={2.5} color={isActive ? "white" : dotColor} />
                        ) : (
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: isActive ? "white" : dotColor }}
                          />
                        )}
                      </button>
                      <button
                        type="button"
                        onMouseEnter={() => onHover(index)}
                        onMouseLeave={() => onHover(null)}
                        onClick={() => onSelect(index)}
                        className={`flex min-w-0 flex-1 items-baseline justify-between gap-3 rounded-sm px-2 py-1 text-left transition-colors duration-150 ${
                          isActive ? "bg-navy-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {labelFor(seg)}
                          </span>
                          <span className="block truncate text-xs text-slate-500">{seg.location_label}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs text-slate-500">
                          <span className="tabular-nums block font-medium text-slate-700">{formatClock(seg.start_datetime)}</span>
                          <span className="tabular-nums block">{formatDuration(durationHours)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  )
}
