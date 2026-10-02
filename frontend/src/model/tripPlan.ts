import type { DailyLog, DutyStatus, StopType, TripRequest, TripResponse, TripSegment } from "../api/types"
import { restartLabel, restartReason, scheduleLabel, STOP_LABELS, STOP_REASONS } from "../config/stopTypes"
import { dateKeyOf, durationBetween, round2 } from "./format"

/* ------------------------------------------------------------------ */
/* ONE computed plan object.                                            */
/*                                                                      */
/* The API response is the source of truth, but several UI surfaces     */
/* used to derive "days", "total trip", cycle hours and review flags    */
/* independently and could disagree. `buildTripPlan` derives every one  */
/* of those figures once; the summary card, sidebar recap, timeline,    */
/* map and daily-log tabs all read from it. No HOS rule is re-computed  */
/* here — only presentation facts are derived from the engine's output. */
/* ------------------------------------------------------------------ */

export interface PlanSegment {
  index: number
  seg: TripSegment
  hours: number
  miles: number
  /** Which calendar day (0-based) the segment starts on. */
  dayIndex: number
}

export interface PlanDay {
  index: number
  date: string
  driveHours: number
  onDutyHours: number
  /** Off duty + sleeper berth within this calendar day, from the log. */
  restHours: number
  miles: number
  /** Odometer reading at the start/end of this day's driving — used to
   * colour the map route per day. */
  odometerStart: number
  odometerEnd: number
  segments: PlanSegment[]
  stops: number
  status: "ok" | "warning"
  statusNote: string | null
  log: DailyLog | null
}

export type IssueFix =
  | { kind: "fresh-rest"; label: string }
  | { kind: "shift-departure"; label: string; hours: number }
  | { kind: "none" }

export interface PlanIssue {
  id: string
  severity: "warning" | "info"
  title: string
  detail: string
  fix: IssueFix
}

export interface TripPlan {
  trip: TripResponse
  distanceMiles: number
  /** Pure driving time (distance / 55 mph). */
  driveHours: number
  /** Wall-clock elapsed time from the first duty segment to the last —
   * includes every break, rest and restart. This is "Total trip". */
  elapsedHours: number
  /** Calendar days touched by the plan: equals the number of log sheets.
   * Elapsed 25.6 h can touch 2 calendar days — that is not a contradiction. */
  calendarDays: number
  startIso: string
  endIso: string
  days: PlanDay[]
  segments: PlanSegment[]
  stopCount: number
  cycle: {
    schedule: string
    capHours: number
    capDays: number
    usedAtStart: number
    usedAtEnd: number
    remainingAtEnd: number
    remainingAtStart: number
  }
  restart: { hours: number; label: string; reason: string; used: boolean }
  issues: PlanIssue[]
  needsReview: boolean
  /** The final day's driving is under this threshold → the schedule is
   * worth optimising (a very short last leg means a nearly-wasted day). */
  shortFinalDay: { driveHours: number } | null
}

export const SHORT_FINAL_DAY_HOURS = 2

const ON_DUTY: DutyStatus[] = ["DRIVING", "ON_DUTY_NOT_DRIVING"]
const REST: DutyStatus[] = ["OFF_DUTY", "SLEEPER_BERTH"]

export function buildTripPlan(trip: TripResponse): TripPlan {
  const logsByDate = new Map(trip.logs.map((l) => [l.date, l]))
  const dayDates: string[] = []
  const seen = new Set<string>()
  const pushDate = (d: string) => {
    if (!seen.has(d)) {
      seen.add(d)
      dayDates.push(d)
    }
  }
  trip.logs.forEach((l) => pushDate(l.date))
  trip.segments.forEach((s) => pushDate(dateKeyOf(s.start_datetime)))
  dayDates.sort()

  const segments: PlanSegment[] = trip.segments.map((seg, index) => ({
    index,
    seg,
    hours: durationBetween(seg.start_datetime, seg.end_datetime),
    miles: Math.max(0, seg.odometer_end_miles - seg.odometer_start_miles),
    dayIndex: dayDates.indexOf(dateKeyOf(seg.start_datetime)),
  }))

  const days: PlanDay[] = dayDates.map((date, index) => {
    const log = logsByDate.get(date) ?? null
    const own = segments.filter((s) => s.dayIndex === index)
    // Totals come from the log (the engine's own per-day bucketing, which
    // splits midnight-spanning segments correctly); fall back to the
    // segment sums only when a day has no log sheet.
    const driveHours = log ? log.totals.DRIVING : sum(own.filter((s) => s.seg.status === "DRIVING").map((s) => s.hours))
    const onDutyHours = log ? log.totals.ON_DUTY_NOT_DRIVING : sum(own.filter((s) => s.seg.status === "ON_DUTY_NOT_DRIVING").map((s) => s.hours))
    const restHours = log ? log.totals.OFF_DUTY + log.totals.SLEEPER_BERTH : sum(own.filter((s) => REST.includes(s.seg.status)).map((s) => s.hours))
    const miles = log ? log.total_miles : sum(own.map((s) => s.miles))
    const driving = own.filter((s) => s.seg.status === "DRIVING")
    const odometerStart = driving.length ? driving[0].seg.odometer_start_miles : (own[0]?.seg.odometer_start_miles ?? 0)
    const odometerEnd = driving.length ? driving[driving.length - 1].seg.odometer_end_miles : odometerStart
    const stops = own.filter((s) => s.seg.stop_type !== null).length
    const hasRestart = own.some((s) => s.seg.stop_type === "restart" || s.seg.stop_type === "cycle_wait")
    const isTimeRecord = log?.record_type === "time_record"
    const status: PlanDay["status"] = hasRestart || isTimeRecord || (log?.exception_notes.length ?? 0) > 0 ? "warning" : "ok"
    const statusNote = hasRestart ? "Includes a restart or cycle wait" : isTimeRecord ? "Short-haul time record" : (log?.exception_notes[0] ?? null)
    return {
      index,
      date,
      driveHours: round2(driveHours),
      onDutyHours: round2(onDutyHours),
      restHours: round2(restHours),
      miles: Math.round(miles),
      odometerStart,
      odometerEnd,
      segments: own,
      stops,
      status,
      statusNote,
      log,
    }
  })

  const first = trip.segments[0]
  const last = trip.segments[trip.segments.length - 1]
  const startIso = first?.start_datetime ?? `${trip.logs[0]?.date ?? ""}T00:00:00`
  const endIso = last?.end_datetime ?? startIso
  // Prefer the engine's own span; derive it from the segments when an
  // older response lacks it so the two can never disagree in the UI.
  const elapsedHours = round2(trip.route.trip_span_hours ?? durationBetween(startIso, endIso))

  const lastLog = trip.logs[trip.logs.length - 1]
  const usedAtEnd = lastLog ? round2(lastLog.cycle_hours_used_end_of_day) : trip.current_cycle_used_hours
  const cap = trip.cycle_cap_hours
  const cycle = {
    schedule: scheduleLabel(trip.cycle_schedule, trip.cycle_cap_hours, trip.cycle_cap_days),
    capHours: cap,
    capDays: trip.cycle_cap_days,
    usedAtStart: trip.current_cycle_used_hours,
    usedAtEnd,
    remainingAtStart: round2(Math.max(0, cap - trip.current_cycle_used_hours)),
    remainingAtEnd: round2(Math.max(0, cap - usedAtEnd)),
  }

  const restartUsed = trip.segments.some((s) => s.stop_type === "restart")
  const restart = {
    hours: trip.restart_hours,
    label: restartLabel(trip.restart_hours),
    reason: restartReason(trip.restart_hours, trip.cycle_schedule, trip.cycle_cap_hours, trip.cycle_cap_days),
    used: restartUsed,
  }

  const finalDay = days[days.length - 1]
  const shortFinalDay = days.length > 1 && finalDay && finalDay.driveHours > 0 && finalDay.driveHours < SHORT_FINAL_DAY_HOURS ? { driveHours: finalDay.driveHours } : null

  const issues = deriveIssues(trip, days, restart, shortFinalDay)

  return {
    trip,
    distanceMiles: trip.route.distance_miles,
    driveHours: trip.route.duration_hours,
    elapsedHours,
    calendarDays: days.length,
    startIso,
    endIso,
    days,
    segments,
    stopCount: trip.segments.filter((s) => s.stop_type).length,
    cycle,
    restart,
    issues,
    needsReview: issues.some((i) => i.severity === "warning"),
    shortFinalDay,
  }
}

function deriveIssues(trip: TripResponse, days: PlanDay[], restart: TripPlan["restart"], shortFinalDay: TripPlan["shortFinalDay"]): PlanIssue[] {
  const issues: PlanIssue[] = []
  if (trip.driving_hours_today > 0 || trip.on_duty_hours_today > 0) {
    issues.push({
      id: "mid-shift",
      severity: "warning",
      title: "Driver was mid-shift at departure",
      detail: `The plan starts with ${trip.driving_hours_today} h driven and ${trip.on_duty_hours_today} h on duty already used today, so the first break or rest may come sooner than expected.`,
      fix: { kind: "fresh-rest", label: "Start with a fresh 10-hr rest" },
    })
  }
  if (restart.used) {
    issues.push({
      id: "restart",
      severity: "warning",
      title: `Includes a ${restart.label}`,
      detail: restart.reason,
      fix: { kind: "none" },
    })
  }
  if (trip.segments.some((s) => s.stop_type === "cycle_wait")) {
    issues.push({
      id: "cycle-wait",
      severity: "warning",
      title: "Waits for cycle hours to age off",
      detail: STOP_REASONS.cycle_wait,
      fix: { kind: "none" },
    })
  }
  if (days.length > 5) {
    issues.push({
      id: "long-trip",
      severity: "warning",
      title: `${days.length} log days`,
      detail: "A trip this long usually deserves a second look at load timing and driver availability.",
      fix: { kind: "none" },
    })
  }
  if (trip.operating_mode && trip.operating_mode !== "standard" && !trip.exception_applied) {
    issues.push({
      id: "exception-denied",
      severity: "warning",
      title: "Short-haul exception not available",
      detail: `${(trip.exception_reasons ?? []).join("; ") || "Conditions not met"}. The plan was made under standard rules instead.`,
      fix: { kind: "none" },
    })
  }
  if (trip.use_16_hour_exception) {
    issues.push({
      id: "sixteen",
      severity: "info",
      title: trip.exception_applied ? "16-hour exception used today" : "16-hour exception enabled but not needed",
      detail: "The 14-hour window stretched to 16 hours for a driver returning to base. It can be used once every 7 days.",
      fix: { kind: "none" },
    })
  }
  if (shortFinalDay) {
    const hours = Math.ceil(shortFinalDay.driveHours * 2) / 2 + 0.5
    issues.push({
      id: "short-final-day",
      severity: "info",
      title: `Final day has only ${shortFinalDay.driveHours.toFixed(1)} h of driving`,
      detail: `Leaving about ${hours} h earlier may fold the last leg into the previous day and save a log sheet.`,
      fix: { kind: "shift-departure", label: "Optimize schedule", hours },
    })
  }
  return issues
}

/** Applies an issue's suggested fix to the request that produced the trip
 * so the planner can re-run with it. Pure, so it can be unit-tested. */
export function applyIssueFix(request: TripRequest, fix: IssueFix): TripRequest {
  switch (fix.kind) {
    case "fresh-rest":
      return { ...request, driving_hours_today: 0, on_duty_hours_today: 0 }
    case "shift-departure": {
      const [datePart, timePart] = request.client_local_time.split("T")
      const [y, mo, d] = datePart.split("-").map(Number)
      const [h, mi, s] = timePart.split(":").map(Number)
      const ms = Date.UTC(y, mo - 1, d, h, mi, s || 0) - fix.hours * 3_600_000
      const dt = new Date(ms)
      const pad = (n: number) => String(n).padStart(2, "0")
      const local = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`
      return { ...request, client_local_time: local }
    }
    default:
      return request
  }
}

export function describeSegment(plan: TripPlan, seg: TripSegment): { label: string; reason: string } {
  if (seg.stop_type === "restart") return { label: plan.restart.label, reason: plan.restart.reason }
  if (seg.stop_type) return { label: STOP_LABELS[seg.stop_type], reason: seg.remark && seg.stop_type === "cycle_wait" ? seg.remark : STOP_REASONS[seg.stop_type] }
  if (seg.status === "DRIVING") return { label: "Drive", reason: "" }
  return { label: seg.status === "OFF_DUTY" ? "Off duty" : seg.status === "SLEEPER_BERTH" ? "Sleeper berth" : "On duty", reason: seg.remark ?? "" }
}

export function isOnDuty(status: DutyStatus): boolean {
  return ON_DUTY.includes(status)
}

/** "En route, mile 440" labels come from the engine for stops it placed
 * itself; named stops carry the real address. */
export function isEnRouteLabel(label: string): boolean {
  return /^en route/i.test(label)
}

export function stopTypeOf(seg: TripSegment): StopType | null {
  return seg.stop_type
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0)
}
