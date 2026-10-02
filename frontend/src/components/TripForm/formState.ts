import type { CycleSchedule, OperatingMode, TripRequest } from "../../api/types"
import { formatLocalDateTime } from "../../utils/localTime"

export const NAMED_CAPS: Record<"70/8" | "60/7", number> = { "70/8": 70, "60/7": 60 }
export const DEFAULT_RESTART_HOURS = 34

export const initialForm = {
  current_location: "",
  pickup_location: "",
  dropoff_location: "",
  current_cycle_used_hours: "",
  cycle_schedule: "70/8" as CycleSchedule,
  custom_cycle_hours: "",
  custom_cycle_days: "",
  num_drivers: "1" as "1" | "2",
  co_driver_name: "",
  co_driver_cycle_used_hours: "",
  /** One control: off = the regulation's 34 h; on = a custom length. */
  custom_restart: false,
  restart_hours: String(DEFAULT_RESTART_HOURS),
  driving_hours_today: "",
  on_duty_hours_today: "",
  operating_mode: "standard" as OperatingMode,
  work_reporting_location: "",
  return_to_reporting_location: false,
  use_16_hour_exception: false,
  sixteen_hour_attestation: false,
  days_past_14th_hour_this_week: "0",
}
export type FormState = typeof initialForm

export function capFor(form: FormState): number | undefined {
  if (form.cycle_schedule === "custom") {
    const custom = Number(form.custom_cycle_hours)
    return custom > 0 ? custom : undefined
  }
  return NAMED_CAPS[form.cycle_schedule]
}

export function num(s: string): number | null {
  if (s.trim() === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Client-side validation that mirrors the serializer, so the button is
 * disabled until a submit would succeed and errors read the same both ways. */
export function validate(form: FormState): Record<string, string> {
  const e: Record<string, string> = {}
  const cap = capFor(form)
  if (form.current_location.trim().length < 3) e.current_location = "Enter the driver's current location."
  if (form.pickup_location.trim().length < 3) e.pickup_location = "Enter the pickup location."
  if (form.dropoff_location.trim().length < 3) e.dropoff_location = "Enter the dropoff location."
  const cyc = num(form.current_cycle_used_hours)
  if (cyc == null) e.current_cycle_used_hours = "Enter hours used (0 is fine)."
  else if (cyc < 0) e.current_cycle_used_hours = "Hours cannot be negative."
  else if (cap != null && cyc > cap) e.current_cycle_used_hours = `Must be ${cap} h or less for this schedule.`
  if (form.cycle_schedule === "custom") {
    const h = num(form.custom_cycle_hours)
    const d = num(form.custom_cycle_days)
    if (h == null || h < 1 || h > 168) e.custom_cycle_hours = "Enter a cap between 1 and 168 hours."
    if (d == null || d < 1 || d > 30) e.custom_cycle_days = "Enter a window between 1 and 30 days."
  }
  if (form.custom_restart) {
    const r = num(form.restart_hours)
    if (r == null || r < 10 || r > 168) e.restart_hours = "Restart must be between 10 and 168 hours."
  }
  const drv = num(form.driving_hours_today) ?? 0
  const other = num(form.on_duty_hours_today) ?? 0
  const window = drv + other
  if (drv < 0 || drv > 11) e.driving_hours_today = "Driving today must be 0 to 11 hours."
  if (other < 0) e.on_duty_hours_today = "Hours cannot be negative."
  else if (window > 14) e.on_duty_hours_today = `Driving plus other on-duty time is ${window} h — the 14-hour window allows at most 14.`
  if (cyc != null && window > cyc) e.on_duty_hours_today = `Today's ${window} h must already be inside the ${cyc} h cycle total above.`
  if (form.operating_mode !== "standard" && !form.return_to_reporting_location) {
    e.return_to_reporting_location = "Short-haul requires returning to the work reporting location the same day."
  }
  if (form.use_16_hour_exception) {
    if (!form.sixteen_hour_attestation) e.sixteen_hour_attestation = "Confirm both conditions to use the 16-hour exception."
    if (!form.return_to_reporting_location) e.return_to_reporting_location = "The 16-hour exception requires returning to the work reporting location that day."
  }
  if (form.num_drivers === "2") {
    const co = num(form.co_driver_cycle_used_hours)
    if (co == null) e.co_driver_cycle_used_hours = "Enter the co-driver's hours used."
    else if (cap != null && co > cap) e.co_driver_cycle_used_hours = `Must be ${cap} h or less for this schedule.`
  }
  return e
}

export function toRequest(form: FormState): TripRequest {
  return {
    current_location: form.current_location.trim(),
    pickup_location: form.pickup_location.trim(),
    dropoff_location: form.dropoff_location.trim(),
    current_cycle_used_hours: Number(form.current_cycle_used_hours),
    cycle_schedule: form.cycle_schedule,
    custom_cycle_hours: form.cycle_schedule === "custom" ? Number(form.custom_cycle_hours) : undefined,
    custom_cycle_days: form.cycle_schedule === "custom" ? Number(form.custom_cycle_days) : undefined,
    num_drivers: form.num_drivers === "2" ? 2 : 1,
    co_driver_name: form.num_drivers === "2" ? form.co_driver_name.trim() : "",
    co_driver_current_cycle_used_hours: form.num_drivers === "2" && form.co_driver_cycle_used_hours !== "" ? Number(form.co_driver_cycle_used_hours) : undefined,
    restart_hours: form.custom_restart ? Number(form.restart_hours) : DEFAULT_RESTART_HOURS,
    driving_hours_today: num(form.driving_hours_today) ?? 0,
    // The backend wants the whole window used (driving included); the
    // form collects the non-driving part separately so the two inputs
    // never contradict each other.
    on_duty_hours_today: (num(form.driving_hours_today) ?? 0) + (num(form.on_duty_hours_today) ?? 0),
    operating_mode: form.operating_mode,
    work_reporting_location: form.work_reporting_location.trim(),
    return_to_reporting_location: form.return_to_reporting_location,
    use_16_hour_exception: form.operating_mode === "standard" && form.use_16_hour_exception,
    sixteen_hour_attestation: form.sixteen_hour_attestation,
    days_past_14th_hour_this_week: form.operating_mode === "short_haul_non_cdl" ? Number(form.days_past_14th_hour_this_week) : 0,
    client_local_time: formatLocalDateTime(new Date()),
  }
}

/** Inverse of `toRequest`, for share links, recent trips and issue fixes. */
export function fromRequest(r: TripRequest): FormState {
  const nonDriving = Math.max(0, (r.on_duty_hours_today ?? 0) - (r.driving_hours_today ?? 0))
  return {
    ...initialForm,
    current_location: r.current_location,
    pickup_location: r.pickup_location,
    dropoff_location: r.dropoff_location,
    current_cycle_used_hours: String(r.current_cycle_used_hours),
    cycle_schedule: r.cycle_schedule,
    custom_cycle_hours: r.custom_cycle_hours != null ? String(r.custom_cycle_hours) : "",
    custom_cycle_days: r.custom_cycle_days != null ? String(r.custom_cycle_days) : "",
    num_drivers: r.num_drivers === 2 ? "2" : "1",
    co_driver_name: r.co_driver_name ?? "",
    co_driver_cycle_used_hours: r.co_driver_current_cycle_used_hours != null ? String(r.co_driver_current_cycle_used_hours) : "",
    custom_restart: r.restart_hours !== DEFAULT_RESTART_HOURS,
    restart_hours: String(r.restart_hours ?? DEFAULT_RESTART_HOURS),
    driving_hours_today: r.driving_hours_today ? String(r.driving_hours_today) : "",
    on_duty_hours_today: nonDriving ? String(nonDriving) : "",
    operating_mode: r.operating_mode ?? "standard",
    work_reporting_location: r.work_reporting_location ?? "",
    return_to_reporting_location: !!r.return_to_reporting_location,
    use_16_hour_exception: !!r.use_16_hour_exception,
    sixteen_hour_attestation: !!r.sixteen_hour_attestation,
    days_past_14th_hour_this_week: String(r.days_past_14th_hour_this_week ?? 0),
  }
}
