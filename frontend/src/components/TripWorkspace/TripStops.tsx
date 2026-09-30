import { STOP_COLORS, STOP_ICONS, STOP_LABELS, STOP_REASONS, restartLabel, restartReason } from "../../config/stopTypes"
import type { CycleSchedule } from "../../api/types"
import type { OperationalStop } from "../../utils/tripSegments"
import { formatClock, formatDuration } from "../../utils/tripSegments"

interface Props {
  stops: OperationalStop[]
  activeSegmentIndex: number | null
  onSelect: (segmentIndex: number) => void
  /** Only the "restart" label/reason depend on these (the duration itself,
   * and which cycle it resets) — every other stop type is fixed. */
  cycleSchedule: CycleSchedule
  cycleCapHours: number
  cycleCapDays: number
  restartHours: number
}

/** The map communicates *where*; this communicates *what happens and why* —
 * every required stop as a scannable card (icon + type + place + the three
 * numbers a dispatcher actually needs), so meaning doesn't depend on
 * correctly reading a marker color. */
export function TripStops({ stops, activeSegmentIndex, onSelect, cycleSchedule, cycleCapHours, cycleCapDays, restartHours }: Props) {
  if (stops.length === 0) return null

  const labelFor = (type: OperationalStop["type"]) => (type === "restart" ? restartLabel(restartHours) : STOP_LABELS[type])
  const reasonFor = (type: OperationalStop["type"]) =>
    type === "restart" ? restartReason(restartHours, cycleSchedule, cycleCapHours, cycleCapDays) : STOP_REASONS[type]

  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Operational stops</h3>
      <div className="eld-scroll -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
        {stops.map((stop) => {
          const Icon = STOP_ICONS[stop.type]
          const isActive = activeSegmentIndex === stop.segmentIndex
          return (
            <button
              key={stop.segmentIndex}
              type="button"
              onClick={() => onSelect(stop.segmentIndex)}
              className={`group flex w-[230px] shrink-0 flex-col gap-2 rounded-sm border px-3 py-2.5 text-left transition-all duration-150 ease-out lg:w-auto ${
                isActive
                  ? "border-navy-500 bg-navy-50"
                  : "border-slate-300 bg-white hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50 hover:shadow-md"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform duration-150 ease-out group-hover:scale-110"
                  style={{ backgroundColor: `${STOP_COLORS[stop.type]}1a` }}
                >
                  <Icon size={13} strokeWidth={2.25} color={STOP_COLORS[stop.type]} />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {labelFor(stop.type)}
                </span>
              </div>
              <p className="truncate text-sm font-medium text-slate-800" title={stop.label}>
                {stop.label}
              </p>
              <dl className="grid grid-cols-3 gap-1.5 border-t border-slate-200 pt-2 text-xs">
                <div>
                  <dt className="text-slate-500">Arrival</dt>
                  <dd className="tabular-nums font-medium text-slate-700">{formatClock(stop.startIso)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Duration</dt>
                  <dd className="tabular-nums font-medium text-slate-700">{formatDuration(stop.durationHours)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Distance</dt>
                  <dd className="tabular-nums font-medium text-slate-700">{stop.distanceMiles} mi</dd>
                </div>
              </dl>
              <p className="text-xs leading-snug text-slate-500">{reasonFor(stop.type)}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
