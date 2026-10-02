import { useEffect, useRef, useState } from "react"
import { Briefcase, Moon, Truck } from "lucide-react"
import type { DailyLog, DailyLogSegment, DriverProfile, DutyStatus, TripResponse } from "../../api/types"
import { STOP_COLORS, STOP_ICONS, STOP_LABELS, STOP_REASONS, restartLabel, restartReason } from "../../config/stopTypes"
import {
  GRID_X_END,
  GRID_X_START,
  GRID_Y_END,
  GRID_Y_START,
  HOUR_BAND_HEIGHT,
  ROW_HEIGHT,
  ROW_LABELS,
  ROW_NUMBERS,
  ROW_ORDER,
  TOTALS_X_END,
  TOTALS_X_START,
  buildStepPath,
  formatHHMMDuration,
  groupCloseRemarks,
  hourLabel,
  parseLogDate,
  timeToMinutes,
  xForMinutes,
  yForRow,
} from "./logSheetGeometry"
import { computeDailyRecap, type DailyRecap } from "./recap"

const VIEW_WIDTH = 1010
const VIEW_HEIGHT = 250
const REMARKS_TICK_Y = GRID_Y_END + 10
const HOUR_BAND_Y = GRID_Y_START - HOUR_BAND_HEIGHT
// Centered hour labels ("Mid", the first/last tick) would otherwise render
// half outside the band's left edge — invisible white-on-white past it.
const HOUR_BAND_OVERHANG = 18

// Every fixed stop (pickup/dropoff/fuel/break/rest/restart) already carries
// a `stop_type` from the engine — these are only the fallback for a plain
// stretch of driving or off-duty time, which never has one.
const STATUS_FALLBACK_ICON: Record<DutyStatus, typeof Moon> = {
  OFF_DUTY: Moon,
  SLEEPER_BERTH: Moon,
  DRIVING: Truck,
  ON_DUTY_NOT_DRIVING: Briefcase,
}
const STATUS_FALLBACK_COLOR: Record<DutyStatus, string> = {
  OFF_DUTY: "#64748b",
  SLEEPER_BERTH: "#2563eb",
  DRIVING: "#1b2a47",
  ON_DUTY_NOT_DRIVING: "#d97706",
}

/** What a duty-status block actually *is* — for "On Duty (not driving)" and
 * "Sleeper Berth" rows especially, the row label alone ("On Duty") doesn't
 * say whether this block is the pickup, a fuel stop, a mandatory break, or
 * a reset. Every such block carries a `stop_type` from the engine; plain
 * driving/off-duty stretches fall back to the row's own label. A restart's
 * label/reason are built from the trip's own `restart_hours` (not the
 * static 34-hour default in STOP_LABELS/STOP_REASONS), since a trip can
 * override that length. */
function describeSegment(seg: DailyLogSegment, trip: TripResponse) {
  if (seg.stop_type) {
    if (seg.stop_type === "restart") {
      return {
        Icon: STOP_ICONS.restart,
        color: STOP_COLORS.restart,
        title: restartLabel(trip.restart_hours),
        reason: restartReason(trip.restart_hours, trip.cycle_schedule, trip.cycle_cap_hours, trip.cycle_cap_days),
      }
    }
    return {
      Icon: STOP_ICONS[seg.stop_type],
      color: STOP_COLORS[seg.stop_type],
      title: STOP_LABELS[seg.stop_type],
      reason: STOP_REASONS[seg.stop_type],
    }
  }
  return {
    Icon: STATUS_FALLBACK_ICON[seg.status],
    color: STATUS_FALLBACK_COLOR[seg.status],
    title: ROW_LABELS[seg.status].join(" "),
    reason: null as string | null,
  }
}

interface Props {
  log: DailyLog
  driver: DriverProfile
  trip: TripResponse
  /** The full log set and this day's position in it — the recap's trailing
   * on-duty window needs to look back across days, not just this one. */
  allLogs: DailyLog[]
  dayIndex: number
  /** Minute-of-day to flash a vertical marker at — set when a timeline row
   * or map stop is selected elsewhere in the workspace, so the log grid
   * reads as the same event rather than a disconnected chart. */
  highlightMinutes?: number | null
  /** The *other* name on a team trip — never `trip.co_driver_name` read
   * directly, since that's always the co-driver's own name regardless of
   * whose sheet is rendering; on the co-driver's own pages the partner is
   * the primary driver instead, and only the caller knows which is which. */
  partnerDriverName?: string
}

export function ELDLogSheet({ log, driver, trip, allLogs, dayIndex, highlightMinutes, partnerDriverName }: Props) {
  const displayRemarks = groupCloseRemarks(log.remarks)
  const stepPath = buildStepPath(log.segments)
  const grandTotal = ROW_ORDER.reduce((sum, status) => sum + (log.totals[status] ?? 0), 0)
  const recap = computeDailyRecap(allLogs, dayIndex, trip.cycle_cap_hours)
  const { month, day, year } = parseLogDate(log.date)
  const pathRef = useRef<SVGPathElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const hoveredSeg = hoveredIndex != null ? log.segments[hoveredIndex] : null

  // The signature moment: the duty-status line traces the day rather than
  // appearing instantly, re-running on every day switch. This is the one
  // focal animation the surface earns — everything else stays fast/quiet.
  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const length = path.getTotalLength()
    if (reduced) {
      path.style.transition = "none"
      path.style.strokeDasharray = "none"
      path.style.strokeDashoffset = "0"
      return
    }
    path.style.transition = "none"
    path.style.strokeDasharray = `${length}`
    path.style.strokeDashoffset = `${length}`
    // Force a reflow so the browser registers the start state before the
    // transition to the end state is applied on the next tick.
    path.getBoundingClientRect()
    path.style.transition = "stroke-dashoffset 800ms cubic-bezier(0.16, 1, 0.3, 1)"
    path.style.strokeDashoffset = "0"
  }, [stepPath])

  return (
    <div className="scroll-thin w-full overflow-x-auto rounded-xl border border-line bg-white p-4 text-slate-900 shadow-[var(--shadow-card)] dark:border-line-strong print:w-auto print:overflow-visible print:break-inside-avoid print:border-0 print:p-0 print:shadow-none">
      {/* Header — reproduces the paper form's own field layout (title +
          date, From/To, mileage + vehicle, carrier + terminal) as real,
          selectable HTML rather than baked into the SVG, so it stays crisp
          at any zoom and prints as text, not a raster of a chart. */}
      <div className="border-b-2 border-slate-900 pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-900">Driver's Daily Log</h2>
            <p className="text-xs text-slate-500">(24 hours)</p>
          </div>
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-1 num text-sm font-semibold text-slate-900">
              <span>{month}</span>
              <span className="text-slate-500">/</span>
              <span>{day}</span>
              <span className="text-slate-500">/</span>
              <span>{year}</span>
            </div>
            <div className="flex justify-end gap-6 text-[9px] uppercase tracking-wide text-slate-500">
              <span>Month</span>
              <span>Day</span>
              <span>Year</span>
            </div>
          </div>
        </div>

        {/* The form's From/To are where THIS day started and ended — not the
            trip's pickup and dropoff, which a multi-day log would repeat on
            every page. The segments already carry both. */}
        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-slate-500">From:</span>
            <span className="font-medium text-slate-900">{log.segments[0]?.location_label ?? trip.current_location}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-slate-500">To:</span>
            <span className="font-medium text-slate-900">{log.segments[log.segments.length - 1]?.location_label ?? trip.dropoff_location}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2.5 text-xs sm:grid-cols-2">
          <div className="space-y-2.5">
            <div className="flex gap-6">
              <Field label="Driver" value={driver.driverName} />
              {trip.num_drivers === 2 && partnerDriverName && <Field label="Co-driver" value={partnerDriverName} />}
            </div>
            <div className="flex gap-6">
              <Field label="Total miles driving today" value={`${log.total_miles} mi`} />
              <Field label="Trip mileage to date" value={`${log.total_mileage_to_date} mi`} />
            </div>
            <Field label="Truck/tractor and trailer no. (show each unit)" value={`${driver.truckTractorNumber} / ${driver.trailerNumbers}`} />
          </div>
          <div className="space-y-2.5">
            <Field label="Name of carrier or carriers" value={driver.carrierName} />
            <Field label="Main office address" value={driver.mainOfficeAddress} />
            <Field label="Home terminal address" value={driver.homeTerminalAddress} />
          </div>
        </div>
      </div>

      {/* The 24-hour duty-status graph — the one part of this document that
          must be precise, vector-rendered geometry, not an approximation:
          exact grid, an exact stepped line traced from real time intervals,
          not colored bars standing in for one. */}
      {(log.record_type === "time_record" || log.exception_notes.length > 0) && (
        <div className={`mt-3 rounded-lg border px-3 py-2.5 text-xs ${log.record_type === "time_record" ? "border-teal-300 bg-teal-50 text-teal-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
          {log.record_type === "time_record" && log.time_record && (
            <div className="mb-1.5 flex flex-wrap gap-x-6 gap-y-1">
              <span className="font-semibold">Short-haul time record</span>
              <span>
                Reported <span className="num font-medium">{log.time_record.report_time}</span>
              </span>
              <span>
                Released <span className="num font-medium">{log.time_record.release_time}</span>
              </span>
              <span>
                On duty <span className="num font-medium">{log.time_record.on_duty_hours.toFixed(2)} h</span>
              </span>
              <span>
                Farthest from base <span className="num font-medium">{log.time_record.farthest_air_miles} air-mi</span>
              </span>
            </div>
          )}
          {log.exception_notes.map((note, i) => (
            <p key={i} className="leading-snug">
              {note}
            </p>
          ))}
          {log.record_type === "time_record" && <p className="mt-1 text-[11px] opacity-80">The grid below is kept for review; the carrier retains the time record for 6 months in place of a RODS.</p>}
        </div>
      )}
      <div className="relative mt-3 min-w-[760px] print:min-w-0">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Duty status graph for ${log.date}`}
      >
        <rect
          x={GRID_X_START - HOUR_BAND_OVERHANG}
          y={HOUR_BAND_Y}
          width={TOTALS_X_END - (GRID_X_START - HOUR_BAND_OVERHANG)}
          height={HOUR_BAND_HEIGHT}
          fill="#0f172a"
        />
        {Array.from({ length: 25 }, (_, h) => h).map((h) => {
          const x = xForMinutes(h * 60)
          return (
            <text
              key={h}
              x={x}
              y={HOUR_BAND_Y + HOUR_BAND_HEIGHT - 6}
              textAnchor="middle"
              style={{ fontSize: 8, fontWeight: 600 }}
              fill="white"
            >
              {hourLabel(h)}
            </text>
          )
        })}
        <text x={TOTALS_X_START} y={HOUR_BAND_Y + HOUR_BAND_HEIGHT - 6} style={{ fontSize: 8, fontWeight: 700 }} fill="white">
          Total Hours
        </text>

        {ROW_ORDER.map((status) => (
          <g key={status}>
            <text x={4} y={yForRow(status) - 3} style={{ fontSize: 9, fontWeight: 700 }} className="fill-slate-900">
              {ROW_NUMBERS[status]}
            </text>
            {ROW_LABELS[status].map((line, i) => (
              <text
                key={i}
                x={16}
                y={yForRow(status) - 3 + i * 10 - (ROW_LABELS[status].length - 1) * 4}
                style={{ fontSize: 9 }}
                className="fill-slate-700"
              >
                {line}
              </text>
            ))}
          </g>
        ))}

        {/* A real three-tier table grid, full row height throughout — hour
            lines carry the most weight, the half-hour mark next, and the
            quarter-hour ticks read as fine graph-paper structure rather
            than being demoted to unreadable stubs along the bottom edge. */}
        {Array.from({ length: 24 * 4 + 1 }, (_, q) => q * 15).map((minute) => {
          const x = xForMinutes(minute)
          const isHour = minute % 60 === 0
          const isHalfHour = minute % 30 === 0 && !isHour
          return (
            <line
              key={minute}
              x1={x}
              y1={GRID_Y_START}
              x2={x}
              y2={GRID_Y_END}
              stroke={isHour ? "#334155" : isHalfHour ? "#94a3b8" : "#cbd5e1"}
              strokeWidth={isHour ? (minute % 360 === 0 ? 1.4 : 0.9) : isHalfHour ? 0.6 : 0.4}
            />
          )
        })}

        {ROW_ORDER.map((status, i) => (
          <line
            key={status}
            x1={GRID_X_START}
            y1={GRID_Y_START + i * ROW_HEIGHT}
            x2={GRID_X_END}
            y2={GRID_Y_START + i * ROW_HEIGHT}
            stroke="#94a3b8"
            strokeWidth={0.7}
          />
        ))}
        <line x1={GRID_X_START} y1={GRID_Y_END} x2={GRID_X_END} y2={GRID_Y_END} stroke="#0f172a" strokeWidth={1.4} />
        <line x1={GRID_X_START} y1={GRID_Y_START} x2={GRID_X_START} y2={GRID_Y_END} stroke="#0f172a" strokeWidth={1.4} />
        <line x1={GRID_X_END} y1={GRID_Y_START} x2={GRID_X_END} y2={GRID_Y_END} stroke="#0f172a" strokeWidth={1.4} />

        <path ref={pathRef} d={stepPath} fill="none" stroke="#1f2937" strokeWidth={2.25} strokeLinejoin="round" />

        {highlightMinutes != null && (
          <line
            x1={xForMinutes(highlightMinutes)}
            y1={HOUR_BAND_Y}
            x2={xForMinutes(highlightMinutes)}
            y2={GRID_Y_END}
            stroke="var(--accent)"
            strokeWidth={1.75}
            strokeDasharray="3 2"
          />
        )}

        {/* Tick marks only — no on-graph text. Every one of these events is
            written out legibly in the dedicated Remarks section below;
            duplicating that text here, rotated and packed under the grid,
            is exactly the collision the reference form doesn't have. */}
        {displayRemarks.map((remark, i) => {
          const x = xForMinutes(timeToMinutes(remark.time))
          return <line key={i} x1={x} y1={GRID_Y_END} x2={x} y2={REMARKS_TICK_Y} stroke="#64748b" strokeWidth={0.8} />
        })}

        {ROW_ORDER.map((status) => (
          <text
            key={status}
            x={TOTALS_X_START}
            y={yForRow(status) + 4}
            style={{ fontSize: 11, fontVariantNumeric: "num" }}
            className="fill-slate-800"
          >
            {(log.totals[status] ?? 0).toFixed(2)}
          </text>
        ))}
        <line x1={TOTALS_X_START - 8} y1={HOUR_BAND_Y} x2={TOTALS_X_START - 8} y2={GRID_Y_END} stroke="#0f172a" strokeWidth={1} />
        <line x1={TOTALS_X_END} y1={GRID_Y_START} x2={TOTALS_X_END} y2={GRID_Y_END} stroke="#94a3b8" strokeWidth={0.7} />
        <text
          x={TOTALS_X_START}
          y={GRID_Y_END + 16}
          style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: "num" }}
          className="fill-slate-900"
        >
          {grandTotal.toFixed(2)}
        </text>

        {/* Invisible hit regions, one per drawn segment, plus a colored
            highlight (the segment's own stop-type color, not a flat navy
            tint) on whichever is hovered/focused — a soft fill fade plus a
            thin accent underline, both eased so the row visibly responds
            rather than snapping in and out. */}
        {log.segments.map((seg, i) => {
          const x1 = xForMinutes(timeToMinutes(seg.start_time))
          const x2 = xForMinutes(timeToMinutes(seg.end_time))
          const rowTop = yForRow(seg.status) - ROW_HEIGHT / 2
          const width = Math.max(x2 - x1, 0)
          const isHovered = hoveredIndex === i
          const { color, title, reason } = describeSegment(seg, trip)
          return (
            <g key={i}>
              <rect
                x={x1}
                y={rowTop}
                width={width}
                height={ROW_HEIGHT}
                fill={color}
                fillOpacity={isHovered ? 0.1 : 0}
                style={{ transition: "fill-opacity 180ms ease-out" }}
              />
              <rect
                x={x1}
                y={rowTop + ROW_HEIGHT - 2.5}
                width={width}
                height={2.5}
                fill={color}
                opacity={isHovered ? 1 : 0}
                style={{ transition: "opacity 180ms ease-out" }}
              />
              <rect
                x={x1}
                y={rowTop}
                width={Math.max(width, 1)}
                height={ROW_HEIGHT}
                fill="transparent"
                className="log-segment-hit"
                style={{ pointerEvents: "all", cursor: "pointer" }}
                tabIndex={0}
                role="button"
                aria-label={`${title}${reason ? `, ${reason}` : ""}, ${seg.start_time} to ${seg.end_time}${
                  seg.status === "DRIVING" ? `, ${(seg.odometer_end_miles - seg.odometer_start_miles).toFixed(1)} miles` : ""
                }, ${seg.location_label}`}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex((cur) => (cur === i ? null : cur))}
                onFocus={() => setHoveredIndex(i)}
                onBlur={() => setHoveredIndex((cur) => (cur === i ? null : cur))}
              />
            </g>
          )
        })}
      </svg>

      {hoveredSeg && (() => {
        const { Icon, color, title, reason } = describeSegment(hoveredSeg, trip)
        const cx = (xForMinutes(timeToMinutes(hoveredSeg.start_time)) + xForMinutes(timeToMinutes(hoveredSeg.end_time))) / 2
        const rowTop = yForRow(hoveredSeg.status) - ROW_HEIGHT / 2
        return (
          <div
            className="pointer-events-none absolute z-20"
            style={{
              left: `${(cx / VIEW_WIDTH) * 100}%`,
              top: `${(rowTop / VIEW_HEIGHT) * 100}%`,
              transform: "translate(-50%, calc(-100% - 7px))",
            }}
          >
            {/* Keying on the segment index forces a remount on every hover
                change, so the pop-in animation replays each time — a static
                tooltip that just relocates would read as sluggish/laggy
                instead of as a deliberate, snappy response. */}
            <div
              key={hoveredIndex}
              className="relative w-52 rounded-xl border border-line bg-surface p-2.5 text-[11px] text-ink shadow-[var(--shadow-pop)]"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${color}1a` }}
                >
                  <Icon size={13} strokeWidth={2.25} color={color} />
                </span>
                <span className="font-semibold text-ink">{title}</span>
              </div>
              <div className="num mt-1.5 text-ink-2">
                {hoveredSeg.start_time} – {hoveredSeg.end_time} · {formatHHMMDuration(hoveredSeg.start_time, hoveredSeg.end_time)}
                {hoveredSeg.status === "DRIVING" &&
                  ` · ${(hoveredSeg.odometer_end_miles - hoveredSeg.odometer_start_miles).toFixed(1)} mi`}
              </div>
              <div className="mt-0.5 truncate text-ink-3" title={hoveredSeg.location_label}>
                {hoveredSeg.location_label}
              </div>
              {reason && (
                <div className="mt-1.5 border-t border-line pt-1.5 text-[10px] leading-snug text-ink-3">
                  {reason}
                </div>
              )}
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-line bg-surface"
              />
            </div>
          </div>
        )
      })()}
      </div>

      {/* Remarks — the same duty-change events the grid ticks above, written
          out legibly (the paper form's own instruction: "enter name of
          place... where each change of duty occurred"). */}
      <div className="mt-3 border-t border-slate-300 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Remarks</p>
        {displayRemarks.length > 0 ? (
          <ul className="mt-1 grid grid-cols-1 gap-x-8 gap-y-1 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
            {displayRemarks.map((remark, i) => (
              <li key={i} className="break-words border-b border-dotted border-slate-300 py-0.5">
                <span className="num font-medium">{remark.time}</span>
                {" — "}
                {remark.location_label}
                {remark.notes.length > 0 && <span className="text-slate-500"> ({remark.notes.join(", ")})</span>}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-1.5 h-4 border-b border-dotted border-slate-300" />
        )}
      </div>

      {/* Shipping documents — the form's own blank ruled fields. Nothing in
          this application collects manifest numbers or shipper/commodity
          data, so these stay unfilled rather than inventing values. */}
      <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 border-t border-slate-300 pt-2 text-xs sm:grid-cols-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Shipping documents</p>
          <div className="mt-2 h-4 border-b border-dotted border-slate-300" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">DVL or manifest no.</p>
          <div className="mt-2 h-4 border-b border-dotted border-slate-300" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Shipper &amp; commodity</p>
          <div className="mt-2 h-4 border-b border-dotted border-slate-300" />
        </div>
      </div>

      {/* Recap — the cycle math for whichever schedule this trip actually
          used (see recap.ts), replaying numbers the compliance engine
          produced. The other named schedule's block stays blank, exactly
          like a real driver only fills in the block that applies to them —
          a carrier assigns one schedule or the other, never both
          (§395.3(b)). A "custom" schedule has no column on the real form,
          so it gets its own extra block instead of hijacking one of the
          two printed ones — this whole recap already stops being a literal
          form reproduction the moment the cap itself isn't 70 or 60. */}
      <div className="mt-3 border-t border-slate-300 pt-2 text-xs">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Recap — complete at end of day
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="On-duty hours today (lines 3 &amp; 4)" value={`${recap.onDutyHoursToday.toFixed(2)} hr`} />
          <RecapCycleBlock
            title="70-hour / 8-day drivers"
            days={8}
            recap={trip.cycle_schedule === "70/8" ? recap : null}
          />
          <RecapCycleBlock
            title="60-hour / 7-day drivers"
            days={7}
            recap={trip.cycle_schedule === "60/7" ? recap : null}
          />
          {trip.cycle_schedule === "custom" && (
            <RecapCycleBlock
              title={`${trip.cycle_cap_hours}-hour / ${trip.cycle_cap_days}-day custom cycle`}
              days={trip.cycle_cap_days}
              recap={recap}
            />
          )}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          *If you took {trip.restart_hours} consecutive hours off duty you have {trip.cycle_cap_hours} hours available.
        </p>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}

/** One schedule's block of the Recap. The paper form asks, for an N-day
 * schedule: A = on duty in the last N-1 days including today (what still
 * counts tomorrow), B = cap minus A = available tomorrow, C = on duty in
 * the last N days including today (the window as it stands tonight).
 * `recap` is null for the block that doesn't apply to this trip. */
function RecapCycleBlock({ title, days, recap }: { title: string; days: number; recap: DailyRecap | null }) {
  const fmt = (n: number | undefined) => (recap && n != null ? `${n.toFixed(2)} hr` : "—")
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-600">{title}</p>
      <dl className="mt-1 grid grid-cols-3 gap-1.5">
        <div>
          <dt className="text-[9px] leading-tight text-slate-500">A. On duty last {Math.max(days - 1, 1)} days incl. today</dt>
          <dd className="num font-medium text-slate-900">{fmt(recap?.onDutyCountingTomorrow)}</dd>
        </div>
        <div>
          <dt className="text-[9px] leading-tight text-slate-500">B. Available tomorrow*</dt>
          <dd className="num font-medium text-slate-900">{fmt(recap?.cycleHoursAvailableTomorrow)}</dd>
        </div>
        <div>
          <dt className="text-[9px] leading-tight text-slate-500">C. On duty last {days} days incl. today</dt>
          <dd className="num font-medium text-slate-900">{fmt(recap?.onDutyLastWindow)}</dd>
        </div>
      </dl>
    </div>
  )
}
