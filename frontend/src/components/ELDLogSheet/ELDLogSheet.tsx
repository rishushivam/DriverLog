import { Briefcase, Check, Moon, Truck } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { DailyLog, DailyLogSegment, DriverProfile, DutyStatus, TripResponse } from "../../api/types"
import { STOP_COLORS, STOP_ICONS, STOP_LABELS, STOP_REASONS, restartLabel, restartReason } from "../../config/stopTypes"
import { formatDayLabel } from "../../model/format"
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
const VIEW_HEIGHT = 240
const HOUR_BAND_Y = GRID_Y_START - HOUR_BAND_HEIGHT
// Centered hour labels ("Mid", the first/last tick) would otherwise render
// half outside the band's left edge.
const HOUR_BAND_OVERHANG = 18

export interface SheetFields {
  shipping_documents: string
  manifest_no: string
  shipper_commodity: string
}

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
    return { Icon: STOP_ICONS[seg.stop_type], color: STOP_COLORS[seg.stop_type], title: STOP_LABELS[seg.stop_type], reason: STOP_REASONS[seg.stop_type] }
  }
  return { Icon: STATUS_FALLBACK_ICON[seg.status], color: STATUS_FALLBACK_COLOR[seg.status], title: ROW_LABELS[seg.status].join(" "), reason: null as string | null }
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
   * or map stop is selected elsewhere in the workspace. */
  highlightMinutes?: number | null
  /** The *other* name on a team trip. */
  partnerDriverName?: string
  /** Paper look (default) or the app's own surface colours. Print always
   * forces paper (see index.css). */
  matchTheme?: boolean
  fields: SheetFields
  /** Omitted on the print copies, which are read-only. */
  onFieldChange?: (key: keyof SheetFields, value: string) => void
}

export function ELDLogSheet({ log, driver, trip, allLogs, dayIndex, highlightMinutes, partnerDriverName, matchTheme = false, fields, onFieldChange }: Props) {
  const displayRemarks = groupCloseRemarks(log.remarks)
  const stepPath = buildStepPath(log.segments)
  const grandTotal = ROW_ORDER.reduce((sum, status) => sum + (log.totals[status] ?? 0), 0)
  const sumsTo24 = Math.abs(grandTotal - 24) < 0.01
  const recap = computeDailyRecap(allLogs, dayIndex, trip.cycle_cap_hours)
  const { month, day, year } = parseLogDate(log.date)
  const pathRef = useRef<SVGPathElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const hoveredSeg = hoveredIndex != null ? log.segments[hoveredIndex] : null

  // The signature moment: the duty-status line traces the day rather than
  // appearing instantly, re-running on every day switch.
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
    path.getBoundingClientRect()
    path.style.transition = "stroke-dashoffset 800ms cubic-bezier(0.16, 1, 0.3, 1)"
    path.style.strokeDashoffset = "0"
  }, [stepPath])

  const ink = "var(--paper-ink)"
  const ink2 = "var(--paper-ink-2)"
  const ink3 = "var(--paper-ink-3)"
  const line = "var(--paper-line)"
  const lineStrong = "var(--paper-line-strong)"
  const showBlock = (schedule: "70/8" | "60/7") => trip.cycle_schedule === schedule

  return (
    <div
      className={`log-paper scroll-thin w-full overflow-x-auto rounded-lg p-4 shadow-[0_1px_2px_rgb(0_0_0/0.08),0_10px_30px_-12px_rgb(0_0_0/0.35)] ring-1 ring-black/10 sm:p-5 print:w-auto print:overflow-visible print:break-inside-avoid print:rounded-none print:p-0 print:shadow-none print:ring-0 ${
        matchTheme ? "log-paper--theme" : ""
      }`}
    >
      {/* Header — reproduces the paper form's own field layout as real,
          selectable HTML so it prints as text, not a raster of a chart. */}
      <div className="border-b-2 pb-2" style={{ borderColor: lineStrong }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold tracking-tight" style={{ color: ink }}>
              Driver's Daily Log
            </h2>
            <p className="text-xs" style={{ color: ink3 }}>
              (24 hours) · {formatDayLabel(log.date, true)}
            </p>
          </div>
          <div className="text-right">
            <div className="num flex items-baseline justify-end gap-1 text-sm font-semibold" style={{ color: ink }}>
              <span>{month}</span>
              <span style={{ color: ink3 }}>/</span>
              <span>{day}</span>
              <span style={{ color: ink3 }}>/</span>
              <span>{year}</span>
            </div>
            <div className="flex justify-end gap-6 text-[10px] tracking-wide uppercase" style={{ color: ink3 }}>
              <span>Month</span>
              <span>Day</span>
              <span>Year</span>
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold" style={{ color: ink3 }}>
              From:
            </span>
            <span className="font-medium" style={{ color: ink }}>
              {log.segments[0]?.location_label ?? trip.current_location}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold" style={{ color: ink3 }}>
              To:
            </span>
            <span className="font-medium" style={{ color: ink }}>
              {log.segments[log.segments.length - 1]?.location_label ?? trip.dropoff_location}
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2.5 text-xs sm:grid-cols-2">
          <div className="space-y-2.5">
            <div className="flex gap-6">
              <PaperField label="Driver" value={driver.driverName} />
              {trip.num_drivers === 2 && partnerDriverName && <PaperField label="Co-driver" value={partnerDriverName} />}
            </div>
            <div className="flex gap-6">
              <PaperField label="Total miles driving today" value={`${log.total_miles} mi`} />
              <PaperField label="Trip mileage to date" value={`${log.total_mileage_to_date} mi`} />
            </div>
            <PaperField label="Truck/tractor and trailer no. (show each unit)" value={`${driver.truckTractorNumber} / ${driver.trailerNumbers}`} />
          </div>
          <div className="space-y-2.5">
            <PaperField label="Name of carrier or carriers" value={driver.carrierName} />
            <PaperField label="Main office address" value={driver.mainOfficeAddress} />
            <PaperField label="Home terminal address" value={driver.homeTerminalAddress} />
          </div>
        </div>
      </div>

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

      {/* The 24-hour duty-status graph: exact grid, an exact stepped line
          traced from real time intervals. Line weights: hour 1.0, half-hour
          0.6, quarter 0.35, frame 1.4 — three tiers, applied consistently. */}
      <div className="relative mt-3 min-w-[760px] print:min-w-0">
        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="h-auto w-full" role="img" aria-label={`Duty status graph for ${formatDayLabel(log.date, true)}`}>
          <rect x={GRID_X_START - HOUR_BAND_OVERHANG} y={HOUR_BAND_Y} width={TOTALS_X_END - (GRID_X_START - HOUR_BAND_OVERHANG)} height={HOUR_BAND_HEIGHT} fill="var(--paper-band)" />
          {Array.from({ length: 25 }, (_, h) => h).map((h) => (
            <text key={h} x={xForMinutes(h * 60)} y={HOUR_BAND_Y + HOUR_BAND_HEIGHT - 6} textAnchor="middle" style={{ fontSize: 8.5, fontWeight: 600 }} fill="var(--paper-band-ink)">
              {hourLabel(h)}
            </text>
          ))}
          <text x={TOTALS_X_END - 8} y={HOUR_BAND_Y + HOUR_BAND_HEIGHT - 6} textAnchor="end" style={{ fontSize: 8.5, fontWeight: 700 }} fill="var(--paper-band-ink)">
            Total hours
          </text>

          {ROW_ORDER.map((status) => (
            <g key={status}>
              <text x={4} y={yForRow(status) + 4} style={{ fontSize: 11, fontWeight: 700 }} fill={ink}>
                {ROW_NUMBERS[status]}
              </text>
              {ROW_LABELS[status].map((lineText, i) => (
                <text key={i} x={20} y={yForRow(status) + 4 + i * 11 - (ROW_LABELS[status].length - 1) * 5} style={{ fontSize: 11, fontWeight: i === 0 ? 600 : 400 }} fill={i === 0 ? ink : ink2}>
                  {lineText}
                </text>
              ))}
            </g>
          ))}

          {Array.from({ length: 24 * 4 + 1 }, (_, q) => q * 15).map((minute) => {
            const x = xForMinutes(minute)
            const isHour = minute % 60 === 0
            const isHalfHour = minute % 30 === 0 && !isHour
            return <line key={minute} x1={x} y1={GRID_Y_START} x2={x} y2={GRID_Y_END} stroke={isHour ? ink2 : isHalfHour ? ink3 : line} strokeWidth={isHour ? 1 : isHalfHour ? 0.6 : 0.35} opacity={isHour ? 0.9 : 1} />
          })}

          {ROW_ORDER.map((status, i) => (
            <line key={status} x1={GRID_X_START} y1={GRID_Y_START + i * ROW_HEIGHT} x2={TOTALS_X_END} y2={GRID_Y_START + i * ROW_HEIGHT} stroke={line} strokeWidth={0.7} />
          ))}
          <rect x={GRID_X_START} y={GRID_Y_START} width={GRID_X_END - GRID_X_START} height={GRID_Y_END - GRID_Y_START} fill="none" stroke={lineStrong} strokeWidth={1.4} />

          <path ref={pathRef} d={stepPath} fill="none" stroke={ink} strokeWidth={2.25} strokeLinejoin="round" />

          {highlightMinutes != null && <line x1={xForMinutes(highlightMinutes)} y1={HOUR_BAND_Y} x2={xForMinutes(highlightMinutes)} y2={GRID_Y_END} stroke="var(--accent)" strokeWidth={1.75} strokeDasharray="3 2" />}

          {/* Totals column: each row's hours, and a visible sum to 24.00. */}
          <line x1={TOTALS_X_START - 8} y1={HOUR_BAND_Y} x2={TOTALS_X_START - 8} y2={GRID_Y_END + 18} stroke={lineStrong} strokeWidth={1.4} />
          <line x1={TOTALS_X_END} y1={GRID_Y_START} x2={TOTALS_X_END} y2={GRID_Y_END + 18} stroke={lineStrong} strokeWidth={1.4} />
          {ROW_ORDER.map((status) => (
            <text key={status} x={TOTALS_X_END - 8} y={yForRow(status) + 4} textAnchor="end" className="num" style={{ fontSize: 12 }} fill={ink}>
              {(log.totals[status] ?? 0).toFixed(2)}
            </text>
          ))}
          <line x1={TOTALS_X_START - 8} y1={GRID_Y_END} x2={TOTALS_X_END} y2={GRID_Y_END} stroke={lineStrong} strokeWidth={1.4} />
          <line x1={TOTALS_X_START - 8} y1={GRID_Y_END + 18} x2={TOTALS_X_END} y2={GRID_Y_END + 18} stroke={lineStrong} strokeWidth={1.4} />
          <text x={TOTALS_X_START} y={GRID_Y_END + 13} style={{ fontSize: 9, fontWeight: 600 }} fill={ink3}>
            = 24 h
          </text>
          <text x={TOTALS_X_END - 8} y={GRID_Y_END + 13} textAnchor="end" className="num" style={{ fontSize: 12, fontWeight: 700 }} fill={sumsTo24 ? ink : "#c2410c"}>
            {grandTotal.toFixed(2)}
          </text>

          {/* Invisible hit regions, one per drawn segment, plus a colored
              highlight on whichever is hovered/focused. */}
          {log.segments.map((seg, i) => {
            const x1 = xForMinutes(timeToMinutes(seg.start_time))
            const x2 = xForMinutes(timeToMinutes(seg.end_time))
            const rowTop = yForRow(seg.status) - ROW_HEIGHT / 2
            const width = Math.max(x2 - x1, 0)
            const isHovered = hoveredIndex === i
            const { color, title, reason } = describeSegment(seg, trip)
            return (
              <g key={i}>
                <rect x={x1} y={rowTop} width={width} height={ROW_HEIGHT} fill={color} fillOpacity={isHovered ? 0.12 : 0} style={{ transition: "fill-opacity 180ms ease-out" }} />
                <rect x={x1} y={rowTop + ROW_HEIGHT - 2.5} width={width} height={2.5} fill={color} opacity={isHovered ? 1 : 0} style={{ transition: "opacity 180ms ease-out" }} />
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
                  aria-label={`${title}${reason ? `, ${reason}` : ""}, ${seg.start_time} to ${seg.end_time}${seg.status === "DRIVING" ? `, ${(seg.odometer_end_miles - seg.odometer_start_miles).toFixed(1)} miles` : ""}, ${seg.location_label}`}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex((cur) => (cur === i ? null : cur))}
                  onFocus={() => setHoveredIndex(i)}
                  onBlur={() => setHoveredIndex((cur) => (cur === i ? null : cur))}
                />
              </g>
            )
          })}
        </svg>

        {hoveredSeg &&
          (() => {
            const { Icon, color, title, reason } = describeSegment(hoveredSeg, trip)
            const cx = (xForMinutes(timeToMinutes(hoveredSeg.start_time)) + xForMinutes(timeToMinutes(hoveredSeg.end_time))) / 2
            const rowTop = yForRow(hoveredSeg.status) - ROW_HEIGHT / 2
            return (
              <div className="pointer-events-none absolute z-20 print:hidden" style={{ left: `${(cx / VIEW_WIDTH) * 100}%`, top: `${(rowTop / VIEW_HEIGHT) * 100}%`, transform: "translate(-50%, calc(-100% - 7px))" }}>
                <div key={hoveredIndex} role="tooltip" className="relative w-56 rounded-xl border border-line bg-surface p-2.5 text-xs text-ink shadow-[var(--shadow-3)]">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}1a` }}>
                      <Icon size={13} strokeWidth={2.25} color={color} />
                    </span>
                    <span className="font-semibold text-ink">{title}</span>
                  </div>
                  <div className="num mt-1.5 text-ink-2">
                    {hoveredSeg.start_time} – {hoveredSeg.end_time} · {formatHHMMDuration(hoveredSeg.start_time, hoveredSeg.end_time)}
                    {hoveredSeg.status === "DRIVING" && ` · ${(hoveredSeg.odometer_end_miles - hoveredSeg.odometer_start_miles).toFixed(1)} mi`}
                  </div>
                  <div className="mt-0.5 truncate text-ink-3" title={hoveredSeg.location_label}>
                    {hoveredSeg.location_label}
                  </div>
                  {reason && <div className="mt-1.5 border-t border-line pt-1.5 text-[11px] leading-snug text-ink-3">{reason}</div>}
                  <div aria-hidden="true" className="absolute top-full left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-r border-b border-line bg-surface" />
                </div>
              </div>
            )
          })()}
      </div>

      {/* Remarks — the duty-change events, written out legibly. */}
      <div className="mt-3 border-t pt-2" style={{ borderColor: line }}>
        <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: ink3 }}>
          Remarks
        </p>
        {displayRemarks.length > 0 ? (
          <ul className="mt-1 grid grid-cols-1 gap-x-8 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3" style={{ color: ink2 }}>
            {displayRemarks.map((remark, i) => (
              <li key={i} className="border-b border-dotted py-0.5 break-words" style={{ borderColor: line }}>
                <span className="num font-medium" style={{ color: ink }}>
                  {remark.time}
                </span>
                {" — "}
                {remark.location_label}
                {remark.notes.length > 0 && <span style={{ color: ink3 }}> ({remark.notes.join(", ")})</span>}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-1.5 h-4 border-b border-dotted" style={{ borderColor: line }} />
        )}
      </div>

      {/* Shipping documents — editable; nothing in the engine knows these. */}
      <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 border-t pt-2 text-xs sm:grid-cols-3" style={{ borderColor: line }}>
        <EditableField label="Shipping documents" value={fields.shipping_documents} placeholder="BOL / pro number" onChange={onFieldChange ? (v) => onFieldChange("shipping_documents", v) : undefined} />
        <EditableField label="DVL or manifest no." value={fields.manifest_no} placeholder="Manifest no." onChange={onFieldChange ? (v) => onFieldChange("manifest_no", v) : undefined} />
        <EditableField label="Shipper & commodity" value={fields.shipper_commodity} placeholder="Shipper — commodity" onChange={onFieldChange ? (v) => onFieldChange("shipper_commodity", v) : undefined} />
      </div>

      {/* Recap — only the block for the schedule this trip actually uses.
          A carrier assigns one schedule or the other, never both. */}
      <div className="mt-3 border-t pt-2 text-xs" style={{ borderColor: line }}>
        <p className="mb-1.5 text-[10px] font-semibold tracking-wide uppercase" style={{ color: ink3 }}>
          Recap — complete at end of day
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
          <PaperField label="On-duty hours today (lines 3 & 4)" value={`${recap.onDutyHoursToday.toFixed(2)} hr`} />
          {showBlock("70/8") && <RecapCycleBlock title="70-hour / 8-day drivers" days={8} recap={recap} />}
          {showBlock("60/7") && <RecapCycleBlock title="60-hour / 7-day drivers" days={7} recap={recap} />}
          {trip.cycle_schedule === "custom" && <RecapCycleBlock title={`${trip.cycle_cap_hours}-hour / ${trip.cycle_cap_days}-day custom cycle`} days={trip.cycle_cap_days} recap={recap} />}
        </div>
        <p className="mt-2 text-[10px]" style={{ color: ink3 }}>
          *If you took {trip.restart_hours} consecutive hours off duty you have {trip.cycle_cap_hours} hours available.
        </p>
        {sumsTo24 && (
          <p className="num mt-1 flex items-center gap-1 text-[10px] print:hidden" style={{ color: ink3 }}>
            <Check size={10} aria-hidden="true" /> Duty-status totals sum to 24.00 h
          </p>
        )}
      </div>
    </div>
  )
}

function PaperField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] tracking-wide uppercase" style={{ color: "var(--paper-ink-3)" }}>
        {label}
      </p>
      <p className="text-sm font-medium break-words" style={{ color: "var(--paper-ink)" }}>
        {value}
      </p>
    </div>
  )
}

function EditableField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange?: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] tracking-wide uppercase" style={{ color: "var(--paper-ink-3)" }}>
        {label}
        {onChange ? <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="num mt-1" /> : <span className="num mt-1 block min-h-5 border-b border-dotted text-[13px] normal-case" style={{ borderColor: "var(--paper-line)", color: "var(--paper-ink)" }}>{value}</span>}
      </label>
    </div>
  )
}

/** One schedule's block of the Recap. For an N-day schedule: A = on duty in
 * the last N-1 days including today (what still counts tomorrow), B = cap
 * minus A = available tomorrow, C = on duty in the last N days including
 * today. */
function RecapCycleBlock({ title, days, recap }: { title: string; days: number; recap: DailyRecap }) {
  const fmt = (n: number) => `${n.toFixed(2)} hr`
  return (
    <div>
      <p className="text-[10px] font-semibold" style={{ color: "var(--paper-ink-2)" }}>
        {title}
      </p>
      <dl className="mt-1 grid grid-cols-3 gap-1.5">
        <div>
          <dt className="text-[9px] leading-tight" style={{ color: "var(--paper-ink-3)" }}>
            A. On duty last {Math.max(days - 1, 1)} days incl. today
          </dt>
          <dd className="num font-medium" style={{ color: "var(--paper-ink)" }}>
            {fmt(recap.onDutyCountingTomorrow)}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] leading-tight" style={{ color: "var(--paper-ink-3)" }}>
            B. Available tomorrow*
          </dt>
          <dd className="num font-medium" style={{ color: "var(--paper-ink)" }}>
            {fmt(recap.cycleHoursAvailableTomorrow)}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] leading-tight" style={{ color: "var(--paper-ink-3)" }}>
            C. On duty last {days} days incl. today
          </dt>
          <dd className="num font-medium" style={{ color: "var(--paper-ink)" }}>
            {fmt(recap.onDutyLastWindow)}
          </dd>
        </div>
      </dl>
    </div>
  )
}
