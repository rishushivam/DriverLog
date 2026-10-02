export type DutyStatus = "OFF_DUTY" | "SLEEPER_BERTH" | "DRIVING" | "ON_DUTY_NOT_DRIVING"

/** A carrier assigns a driver to one schedule or the other, never both
 * (49 CFR §395.3(b)) — "70/8" is the default; "60/7" is for carriers that
 * don't operate every day of the week. "custom" isn't a real FMCSA
 * schedule — it lets the tool explore a cycle cap other than 70 or 60; its
 * actual hour value always lives in `TripResponse.cycle_cap_hours`. */
export type CycleSchedule = "70/8" | "60/7" | "custom"

export interface DailyLogSegment {
  status: DutyStatus
  start_time: string
  end_time: string
  location_label: string
  /** Which operational event this block is, when it's a fixed stop
   * (pickup/dropoff/fuel/break/rest/restart) rather than a plain stretch of
   * driving or overnight off-duty — null for the latter. Lets "On Duty (not
   * driving)" and "Sleeper Berth" blocks say *why*, not just *that*. */
  stop_type: StopType | null
  remark: string | null
  odometer_start_miles: number
  odometer_end_miles: number
}

export interface DailyLogRemark {
  time: string
  location_label: string
  note: string | null
}

export interface DriverProfile {
  id: string
  driverName: string
  carrierName: string
  mainOfficeAddress: string
  homeTerminalAddress: string
  truckTractorNumber: string
  trailerNumbers: string
}

export interface DailyLog {
  date: string
  total_miles: number
  segments: DailyLogSegment[]
  remarks: DailyLogRemark[]
  totals: Record<DutyStatus, number>
  total_mileage_to_date: number
  /** Full N-day rolling window total at end of day (Recap line C). */
  cycle_hours_used_end_of_day: number
  /** The (N-1)-day total — the part still counting tomorrow (Recap line A,
   * so line B "available tomorrow" is cap minus this). */
  cycle_hours_counting_tomorrow: number
  /** "time_record" when a short-haul exception applied to this day (§395.1(e)):
   * the carrier keeps report/release times instead of a RODS. */
  record_type: "rods" | "time_record"
  time_record: {
    report_time: string
    release_time: string
    on_duty_hours: number
    window_hours: number
    farthest_air_miles: number
  } | null
  /** Plain-language notes about any exception relied on this day. */
  exception_notes: string[]
}

export type OperatingMode = "standard" | "short_haul_cdl" | "short_haul_non_cdl"

export type StopType =
  | "current"
  | "pickup"
  | "dropoff"
  | "fuel"
  | "break"
  | "rest"
  | "restart"
  /** The cycle cap bound, but older hours age off the rolling window sooner
   * than a 34-hour restart would clear it — the regulation's own
   * "wait it out" alternative (§395.3(b)); never resets the cycle. */
  | "cycle_wait"
  /** Back at the work reporting location: post-trip check-in and release. */
  | "return"

export interface RouteStop {
  coords: [number, number]
  label: string
  type: StopType
}

/** Full-fidelity, trip-wide segment (as opposed to `DailyLogSegment`, which
 * is scoped to one calendar day and trimmed to what the log grid draws). */
export interface TripSegment {
  status: DutyStatus
  start_datetime: string
  end_datetime: string
  location_label: string
  odometer_start_miles: number
  odometer_end_miles: number
  remark: string | null
  stop_type: StopType | null
}

export interface RouteGeometry {
  to_pickup: [number, number][]
  to_dropoff: [number, number][]
  to_reporting: [number, number][] | null
}

export interface TripRoute {
  distance_miles: number
  /** Raw distance / 55mph — driving time only, ignores every break/rest/
   * restart. Do not show this alone as "how long the trip takes" — use
   * trip_span_hours for that. */
  duration_hours: number
  /** Real wall-clock span from the first duty segment to the last —
   * includes every break/rest/restart. This is what actually answers "how
   * long until delivery," and can be much larger than duration_hours when
   * a 34-hour restart or multiple 10-hour resets are needed. */
  trip_span_hours: number
  current_location_coords: [number, number]
  pickup_location_coords: [number, number]
  dropoff_location_coords: [number, number]
  work_reporting_coords: [number, number] | null
  geometry: RouteGeometry
  stops: RouteStop[]
}

export interface TripResponse {
  id: number
  current_location: string
  pickup_location: string
  dropoff_location: string
  current_cycle_used_hours: number
  cycle_schedule: CycleSchedule
  /** The cap actually enforced — 70/60 for a named schedule, or the
   * driver-supplied value when cycle_schedule is "custom". Always read
   * this for cycle-cap math; never assume 70 or 60 from cycle_schedule
   * alone. */
  cycle_cap_hours: number
  /** The rolling-window day count that names the schedule (8 for 70/8, 7
   * for 60/7, or the driver-supplied value for "custom") — display-only,
   * but a schedule is a two-number name, not just the hour cap alone. */
  cycle_cap_days: number
  num_drivers: 1 | 2
  co_driver_name: string
  /** Driver 2's own starting cycle-hours reading — null for a solo trip, or
   * an older team trip saved before each driver got their own value (it
   * then defaulted to `current_cycle_used_hours`). */
  co_driver_current_cycle_used_hours: number | null
  /** 49 CFR §395.3(c)'s restart is fixed at 34 consecutive hours off duty —
   * this trip's own value, which defaults to 34 but can be overridden to
   * explore a different reset length. Every restart-stop label/reason in
   * the UI is built from this, not a hardcoded "34". */
  restart_hours: number
  /** The driver's duty period already in progress at submit time (hours
   * since their last 10-hour rest). 0/0 = fresh clock. */
  driving_hours_today: number
  on_duty_hours_today: number
  /** Short-haul / 16-hour exceptions (§395.1(e), §395.1(o)). */
  operating_mode: OperatingMode
  work_reporting_location: string
  return_to_reporting_location: boolean
  use_16_hour_exception: boolean
  days_past_14th_hour_this_week: number
  /** Whether the finished plan actually qualified for the requested
   * exception; when false, `exception_reasons` names each failed test and
   * the plan was re-made under standard §395.3 rules. */
  exception_applied: boolean
  exception_reasons: string[]
  farthest_air_miles: number | null
  route: TripRoute
  logs: DailyLog[]
  /** Driver 2's own separate personal log — null for solo trips. Team
   * driving never merges two people's hours onto one sheet, so this is a
   * genuinely independent log, not a display variant of `logs`. */
  co_driver_logs: DailyLog[] | null
  segments: TripSegment[]
  created_at: string
}

export interface TripRequest {
  current_location: string
  pickup_location: string
  dropoff_location: string
  current_cycle_used_hours: number
  cycle_schedule: CycleSchedule
  /** Required (and only meaningful) when cycle_schedule is "custom" — a
   * schedule is really two numbers ("70-hour / 8-day"), so a custom one
   * needs both the cycle cap and its own day count, not just the cap
   * standing in alone. */
  custom_cycle_hours?: number
  custom_cycle_days?: number
  /** 2 = a real two-driver simulation (independent HOS clocks, alternating
   * who's driving) — see hos_engine/team_engine.py. */
  num_drivers: 1 | 2
  co_driver_name: string
  /** Driver 2's own starting cycle-hours reading — only meaningful when
   * num_drivers is 2. Optional: the backend falls back to
   * current_cycle_used_hours when omitted, but two real drivers essentially
   * never share the exact same number. */
  co_driver_current_cycle_used_hours?: number
  /** 49 CFR §395.3(c)'s restart is fixed at 34 consecutive hours off duty;
   * exposed anyway so the tool can explore a different reset length —
   * defaults to 34 on the backend when omitted. */
  restart_hours: number
  /** Hours already driven / on duty in the driver's CURRENT duty period at
   * submit time (since their last 10-hour rest). Omit or 0 for a fresh
   * clock. Driver 1 only on a team trip; the co-driver is assumed rested. */
  driving_hours_today?: number
  on_duty_hours_today?: number
  operating_mode?: OperatingMode
  /** Defaults to the current location when blank. */
  work_reporting_location?: string
  return_to_reporting_location?: boolean
  use_16_hour_exception?: boolean
  sixteen_hour_attestation?: boolean
  days_past_14th_hour_this_week?: number
  /** The driver's own local wall-clock reading at submit time, naive
   * "YYYY-MM-DDTHH:MM:SS" — the backend anchors the whole simulation to
   * this instead of its own server clock, which may be in any timezone. */
  client_local_time: string
}

export interface LocationSuggestion {
  label: string
  coords: [number, number]
}

export type FieldErrors = Record<string, string[]>

export interface ApiError {
  kind: "network" | "validation" | "unprocessable" | "server"
  message: string
  fieldErrors?: FieldErrors
}
