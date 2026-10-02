import { AnimatePresence, motion } from "framer-motion"
import { Check, Circle, Flag, Home, MapPin, Route, Sparkles, Timer, Users } from "lucide-react"
import { useEffect, useId, useMemo, useState } from "react"
import type { ApiError, CycleSchedule, OperatingMode, TripRequest } from "../../api/types"
import { DRIVER_PROFILES } from "../../config/drivers"
import { formatLocalDateTime } from "../../utils/localTime"
import { Chip } from "../ui/Chip"
import { Field } from "../ui/Field"
import { Reveal } from "../ui/Reveal"
import { SegmentedControl } from "../ui/SegmentedControl"
import { press, quick } from "../ui/motion"
import { CycleSlider } from "./CycleSlider"
import { LocationField } from "./LocationField"

interface Props {
  onSubmit: (payload: TripRequest) => void
  isSubmitting: boolean
  /** Flips true briefly after a successful plan so the button can confirm. */
  justSucceeded: boolean
  error: ApiError | null
  driverId: string
  onDriverChange: (driverId: string) => void
  onLoadExample?: () => void
}

const NAMED_CAPS: Record<"70/8" | "60/7", number> = { "70/8": 70, "60/7": 60 }
const DEFAULT_RESTART_HOURS = "34"

const initialForm = {
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
  restart_hours: DEFAULT_RESTART_HOURS,
  driving_hours_today: "",
  on_duty_hours_today: "",
  operating_mode: "standard" as OperatingMode,
  work_reporting_location: "",
  return_to_reporting_location: false,
  use_16_hour_exception: false,
  sixteen_hour_attestation: false,
  days_past_14th_hour_this_week: "0",
}
type FormState = typeof initialForm

function capFor(form: FormState): number | undefined {
  if (form.cycle_schedule === "custom") {
    const custom = Number(form.custom_cycle_hours)
    return custom > 0 ? custom : undefined
  }
  return NAMED_CAPS[form.cycle_schedule]
}

function num(s: string): number | null {
  if (s.trim() === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Client-side validation that mirrors the serializer, so the button is
 * disabled until a submit would succeed and errors read the same both ways. */
function validate(form: FormState): Record<string, string> {
  const e: Record<string, string> = {}
  const cap = capFor(form)
  if (form.current_location.trim().length < 3) e.current_location = "Enter the driver's current location."
  if (form.pickup_location.trim().length < 3) e.pickup_location = "Enter the pickup location."
  if (form.dropoff_location.trim().length < 3) e.dropoff_location = "Enter the dropoff location."
  const cyc = num(form.current_cycle_used_hours)
  if (cyc == null) e.current_cycle_used_hours = "Enter hours used (0 is fine)."
  else if (cyc < 0) e.current_cycle_used_hours = "Hours cannot be negative."
  else if (cap != null && cyc > cap) e.current_cycle_used_hours = `Must be ${cap} or less for this schedule.`
  if (form.cycle_schedule === "custom") {
    const h = num(form.custom_cycle_hours)
    const d = num(form.custom_cycle_days)
    if (h == null || h < 1 || h > 168) e.custom_cycle_hours = "Enter a cap between 1 and 168 hours."
    if (d == null || d < 1 || d > 30) e.custom_cycle_days = "Enter a window between 1 and 30 days."
  }
  const r = num(form.restart_hours)
  if (r == null || r < 10 || r > 168) e.restart_hours = "Restart must be between 10 and 168 hours."
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
    else if (cap != null && co > cap) e.co_driver_cycle_used_hours = `Must be ${cap} or less for this schedule.`
  }
  return e
}

function SectionHeading({ icon: Icon, children }: { icon: typeof Route; children: string }) {
  return (
    <h3 className="flex items-center gap-2 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
      <Icon size={13} strokeWidth={2.25} aria-hidden="true" />
      {children}
    </h3>
  )
}

export function TripForm({ onSubmit, isSubmitting, justSucceeded, error, driverId, onDriverChange, onLoadExample }: Props) {
  const uid = useId()
  const [form, setForm] = useState<FormState>(initialForm)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [attempted, setAttempted] = useState(false)
  const [openChip, setOpenChip] = useState<"schedule" | "restart" | "drivers" | "mode" | null>(null)
  const [shiftOpen, setShiftOpen] = useState(false)

  const clientErrors = useMemo(() => validate(form), [form])
  const isValid = Object.keys(clientErrors).length === 0

  // Server-side field errors win over client ones once they exist.
  const serverErrors = error?.kind === "validation" ? error.fieldErrors : undefined
  useEffect(() => {
    if (serverErrors) setAttempted(true)
  }, [serverErrors])

  function fieldError(field: string): string | undefined {
    const server = serverErrors?.[field === "co_driver_cycle_used_hours" ? "co_driver_current_cycle_used_hours" : field]?.[0]
    if (server) return server
    if (attempted || touched[field]) return clientErrors[field]
    return undefined
  }
  const set = (field: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [field]: value }))
  const touch = (field: string) => () => setTouched((t) => ({ ...t, [field]: true }))

  function changeSchedule(schedule: CycleSchedule) {
    setForm((f) => {
      const next = { ...f, cycle_schedule: schedule }
      const cap = capFor(next)
      if (cap != null && Number(next.current_cycle_used_hours) > cap) next.current_cycle_used_hours = String(cap)
      if (cap != null && Number(next.co_driver_cycle_used_hours) > cap) next.co_driver_cycle_used_hours = String(cap)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)
    if (!isValid) return
    onSubmit({
      current_location: form.current_location.trim(),
      pickup_location: form.pickup_location.trim(),
      dropoff_location: form.dropoff_location.trim(),
      current_cycle_used_hours: Number(form.current_cycle_used_hours),
      cycle_schedule: form.cycle_schedule,
      custom_cycle_hours: form.cycle_schedule === "custom" ? Number(form.custom_cycle_hours) : undefined,
      custom_cycle_days: form.cycle_schedule === "custom" ? Number(form.custom_cycle_days) : undefined,
      num_drivers: form.num_drivers === "2" ? 2 : 1,
      co_driver_name: form.num_drivers === "2" ? form.co_driver_name.trim() : "",
      co_driver_current_cycle_used_hours:
        form.num_drivers === "2" && form.co_driver_cycle_used_hours !== "" ? Number(form.co_driver_cycle_used_hours) : undefined,
      restart_hours: Number(form.restart_hours),
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
    })
  }

  const cap = capFor(form) ?? 70
  const scheduleValue =
    form.cycle_schedule === "custom"
      ? `${form.custom_cycle_hours || "—"} hr / ${form.custom_cycle_days || "—"} day`
      : form.cycle_schedule === "70/8"
        ? "70 hr / 8 day"
        : "60 hr / 7 day"
  const driversValue = form.num_drivers === "2" ? `Team · ${form.co_driver_name.trim() || "co-driver"}` : "Solo driver"
  const toggleChip = (c: typeof openChip) => () => setOpenChip((o) => (o === c ? null : c))
  const modeValue =
    form.operating_mode === "short_haul_cdl"
      ? "CDL short-haul"
      : form.operating_mode === "short_haul_non_cdl"
        ? "Non-CDL short-haul"
        : form.use_16_hour_exception
          ? "Standard + 16-hr exception"
          : "Standard §395.3"
  const exceptionActive = form.operating_mode !== "standard" || form.use_16_hour_exception

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-7" aria-label="Trip details">
      {/* ------------------------------------------------ Driver */}
      <section className="space-y-3">
        <SectionHeading icon={Users}>Driver</SectionHeading>
        <div className="float-field relative rounded-xl border border-line bg-surface transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--accent-soft)]">
          <select
            id={`${uid}-driver`}
            value={driverId}
            onChange={(e) => onDriverChange(e.target.value)}
            className="peer w-full appearance-none rounded-xl bg-transparent px-3.5 pt-5 pb-1.5 pr-9 text-[15px] text-ink outline-none"
          >
            {DRIVER_PROFILES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.driverName} — {d.carrierName}
              </option>
            ))}
          </select>
          <label htmlFor={`${uid}-driver`} className="pointer-events-none absolute top-1/2 left-3.5 origin-left -translate-y-1/2 text-[14px] text-ink-2">
            Driver
          </label>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-ink-3">
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <Chip label="Drivers" value={driversValue} open={openChip === "drivers"} onToggle={toggleChip("drivers")} controls={`${uid}-drivers-panel`} />
        <Reveal open={openChip === "drivers"} id={`${uid}-drivers-panel`}>
          <SegmentedControl
            name="num-drivers"
            aria-label="Number of drivers"
            value={form.num_drivers}
            onChange={(v) => setForm((f) => ({ ...f, num_drivers: v }))}
            options={[
              { value: "1", label: "1 — Solo" },
              { value: "2", label: "2 — Team" },
            ]}
          />
        </Reveal>
        <Reveal open={form.num_drivers === "2"}>
          <div className="space-y-3 rounded-xl border border-dashed border-line-strong p-3">
            <Field
              id={`${uid}-co-name`}
              label="Co-driver name"
              value={form.co_driver_name}
              onChange={(e) => set("co_driver_name")(e.target.value)}
              valid={form.co_driver_name.trim().length > 1}
            />
            <Field
              id={`${uid}-co-cycle`}
              label="Co-driver's cycle used"
              type="number"
              inputMode="decimal"
              min={0}
              max={cap}
              step={0.5}
              unit="hrs"
              value={form.co_driver_cycle_used_hours}
              onChange={(e) => set("co_driver_cycle_used_hours")(e.target.value)}
              onBlur={touch("co_driver_cycle_used_hours")}
              error={fieldError("co_driver_cycle_used_hours")}
              valid={num(form.co_driver_cycle_used_hours) != null && !clientErrors.co_driver_cycle_used_hours}
              hint="The co-driver is assumed rested at departure."
            />
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------ Route */}
      <section className="space-y-3">
        <SectionHeading icon={Route}>Route</SectionHeading>
        <div className="relative grid grid-cols-[18px_1fr] gap-x-3">
          {/* Connector: dots + a line, like a ride-hailing app. */}
          <div aria-hidden="true" className="relative">
            <span className="absolute top-[22px] bottom-[22px] left-1/2 w-px -translate-x-1/2 border-l-2 border-dotted border-line-strong" />
            <span className="absolute top-[22px] left-1/2 flex h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
              <Circle size={10} strokeWidth={3} className="text-ink" fill="currentColor" />
            </span>
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface p-[1px]">
              <MapPin size={14} strokeWidth={2.5} className="text-accent-600 dark:text-accent" />
            </span>
            <span className="absolute bottom-[22px] left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full bg-surface p-[1px]">
              <Flag size={13} strokeWidth={2.5} className="text-ink" />
            </span>
          </div>
          <div className="space-y-3">
            <LocationField id={`${uid}-origin`} label="Current location" value={form.current_location} onChange={set("current_location")} error={fieldError("current_location")} />
            <LocationField id={`${uid}-pickup`} label="Pickup" value={form.pickup_location} onChange={set("pickup_location")} error={fieldError("pickup_location")} />
            <LocationField id={`${uid}-dropoff`} label="Dropoff" value={form.dropoff_location} onChange={set("dropoff_location")} error={fieldError("dropoff_location")} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Hours & Cycle */}
      <section className="space-y-3">
        <SectionHeading icon={Timer}>Hours &amp; Cycle</SectionHeading>

        <Chip label="Cycle schedule" value={scheduleValue} open={openChip === "schedule"} onToggle={toggleChip("schedule")} controls={`${uid}-schedule-panel`} />
        <Reveal open={openChip === "schedule"} id={`${uid}-schedule-panel`}>
          <SegmentedControl
            name="cycle-schedule"
            aria-label="Cycle schedule"
            size="sm"
            value={form.cycle_schedule}
            onChange={changeSchedule}
            options={[
              { value: "70/8", label: "70 hr / 8 day" },
              { value: "60/7", label: "60 hr / 7 day" },
              { value: "custom", label: "Custom" },
            ]}
          />
          <Reveal open={form.cycle_schedule === "custom"}>
            <div className="grid grid-cols-2 gap-3">
              <Field
                id={`${uid}-custom-hrs`}
                label="Cycle cap"
                type="number"
                inputMode="numeric"
                min={1}
                max={168}
                unit="hrs"
                value={form.custom_cycle_hours}
                onChange={(e) => set("custom_cycle_hours")(e.target.value)}
                onBlur={touch("custom_cycle_hours")}
                error={fieldError("custom_cycle_hours")}
                valid={!clientErrors.custom_cycle_hours}
              />
              <Field
                id={`${uid}-custom-days`}
                label="Window"
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                unit="days"
                value={form.custom_cycle_days}
                onChange={(e) => set("custom_cycle_days")(e.target.value)}
                onBlur={touch("custom_cycle_days")}
                error={fieldError("custom_cycle_days")}
                valid={!clientErrors.custom_cycle_days}
              />
            </div>
          </Reveal>
        </Reveal>

        <CycleSlider
          id={`${uid}-cycle`}
          label={form.num_drivers === "2" ? "Driver's cycle used" : "Cycle hours used"}
          value={form.current_cycle_used_hours}
          cap={cap}
          onChange={(v) => {
            set("current_cycle_used_hours")(v)
            setTouched((t) => ({ ...t, current_cycle_used_hours: true }))
          }}
          error={fieldError("current_cycle_used_hours")}
        />

        <Chip label="Restart duration" value={`${form.restart_hours || "—"} hr off duty`} open={openChip === "restart"} onToggle={toggleChip("restart")} controls={`${uid}-restart-panel`} />
        <Reveal open={openChip === "restart"} id={`${uid}-restart-panel`}>
          <Field
            id={`${uid}-restart`}
            label="Restart duration"
            type="number"
            inputMode="numeric"
            min={10}
            max={168}
            unit="hrs"
            value={form.restart_hours}
            onChange={(e) => set("restart_hours")(e.target.value)}
            onBlur={touch("restart_hours")}
            error={fieldError("restart_hours")}
            valid={!clientErrors.restart_hours}
            hint="§395.3(c) sets 34 hours. Change it only to explore a what-if; 10 is the shortest break that clears the daily clocks."
          />
        </Reveal>

        <button
          type="button"
          onClick={() => setShiftOpen((o) => !o)}
          aria-expanded={shiftOpen}
          aria-controls={`${uid}-shift-panel`}
          className="focus-ring flex w-full items-center justify-between rounded-xl px-1 py-1 text-left text-[13px] font-medium text-ink-2 hover:text-ink"
        >
          <span>{form.num_drivers === "2" ? "Driver already on shift today?" : "Already on shift today?"}</span>
          <span className="text-xs text-accent-700 dark:text-accent-300">
            {shiftOpen ? "Hide" : num(form.driving_hours_today) || num(form.on_duty_hours_today) ? "Edit" : "Add hours"}
          </span>
        </button>
        <Reveal open={shiftOpen} id={`${uid}-shift-panel`}>
          <div className="grid grid-cols-2 gap-3">
            <Field
              id={`${uid}-drv-today`}
              label="Driving"
              type="number"
              inputMode="decimal"
              min={0}
              max={11}
              step={0.25}
              unit="hrs"
              value={form.driving_hours_today}
              onChange={(e) => set("driving_hours_today")(e.target.value)}
              onBlur={touch("driving_hours_today")}
              error={fieldError("driving_hours_today")}
            />
            <Field
              id={`${uid}-od-today`}
              label="Non-driving duty"
              type="number"
              inputMode="decimal"
              min={0}
              max={14}
              step={0.25}
              unit="hrs"
              value={form.on_duty_hours_today}
              onChange={(e) => set("on_duty_hours_today")(e.target.value)}
              onBlur={touch("on_duty_hours_today")}
              error={fieldError("on_duty_hours_today")}
            />
          </div>
          <p className="mt-2 px-1 text-xs text-ink-3">
            Since the last 10-hour rest. Non-driving duty is loading, inspections, fueling and the like. Together they are the 14-hour
            window already used
            {(num(form.driving_hours_today) ?? 0) + (num(form.on_duty_hours_today) ?? 0) > 0 && (
              <>
                : <span className="num text-ink-2">{(num(form.driving_hours_today) ?? 0) + (num(form.on_duty_hours_today) ?? 0)} h</span>
              </>
            )}
            . These hours are already inside the cycle total.
          </p>
        </Reveal>
      </section>

      {/* ------------------------------------------------ Exceptions */}
      <section className="space-y-3">
        <SectionHeading icon={Home}>Operating exception</SectionHeading>
        <Chip label="Rules" value={modeValue} open={openChip === "mode"} onToggle={toggleChip("mode")} controls={`${uid}-mode-panel`} />
        <Reveal open={openChip === "mode"} id={`${uid}-mode-panel`}>
          <SegmentedControl
            name="operating-mode"
            aria-label="Operating mode"
            size="sm"
            value={form.operating_mode}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                operating_mode: v,
                return_to_reporting_location: v === "standard" ? f.return_to_reporting_location : true,
                use_16_hour_exception: v === "standard" ? f.use_16_hour_exception : false,
              }))
            }
            options={[
              { value: "standard", label: "Standard" },
              { value: "short_haul_cdl", label: "CDL short-haul" },
              { value: "short_haul_non_cdl", label: "Non-CDL" },
            ]}
          />
          <p className="mt-2 px-1 text-xs text-ink-3">
            {form.operating_mode === "standard"
              ? "§395.3: 11 h driving in a 14 h window with a 30-min break after 8 h of driving."
              : form.operating_mode === "short_haul_cdl"
                ? "§395.1(e)(1): within 150 air-miles of base, back and released within 14 h, no 30-min break. A time record replaces the log."
                : "§395.1(e)(2): within 150 air-miles of base, no 30-min break, driving to the 14th hour — or the 16th on 2 days per week."}
          </p>
          {form.operating_mode === "standard" && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                checked={form.use_16_hour_exception}
                onChange={(e) => setForm((f) => ({ ...f, use_16_hour_exception: e.target.checked, return_to_reporting_location: e.target.checked ? true : f.return_to_reporting_location }))}
              />
              <span>
                <span className="block font-medium">Use the 16-hour exception today</span>
                <span className="block text-xs text-ink-3">§395.1(o): the window stretches to 16 h once every 7 days for a driver who returns to base.</span>
              </span>
            </label>
          )}
          <Reveal open={form.use_16_hour_exception && form.operating_mode === "standard"}>
            <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${fieldError("sixteen_hour_attestation") ? "border-red-400" : "border-dashed border-line-strong"}`}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                checked={form.sixteen_hour_attestation}
                onChange={(e) => setForm((f) => ({ ...f, sixteen_hour_attestation: e.target.checked }))}
                onBlur={touch("sixteen_hour_attestation")}
              />
              <span className="text-xs leading-snug text-ink-2">
                I confirm the driver returned to the work reporting location on the last 5 duty tours and has not used this exception in the past 7 days
                (or has taken a 34-hour restart since).
              </span>
            </label>
            {fieldError("sixteen_hour_attestation") && <p className="mt-1 px-1 text-xs text-red-600 dark:text-red-400">{fieldError("sixteen_hour_attestation")}</p>}
          </Reveal>
          <Reveal open={form.operating_mode === "short_haul_non_cdl"}>
            <Field
              id={`${uid}-days-14`}
              label="Days this week already driven past the 14th hour"
              type="number"
              inputMode="numeric"
              min={0}
              max={2}
              step={1}
              unit="of 2"
              value={form.days_past_14th_hour_this_week}
              onChange={(e) => set("days_past_14th_hour_this_week")(e.target.value)}
              hint="§395.1(e)(2) allows driving to the 16th hour on at most 2 days in any 7."
            />
          </Reveal>
        </Reveal>

        <Reveal open={exceptionActive || form.return_to_reporting_location}>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                checked={form.return_to_reporting_location}
                onChange={(e) => setForm((f) => ({ ...f, return_to_reporting_location: e.target.checked }))}
              />
              <span>
                <span className="block font-medium">Return to the work reporting location after the dropoff</span>
                <span className="block text-xs text-ink-3">Adds a final leg back to base. Required by every exception above.</span>
              </span>
            </label>
            {fieldError("return_to_reporting_location") && <p className="px-1 text-xs text-red-600 dark:text-red-400">{fieldError("return_to_reporting_location")}</p>}
            <Reveal open={form.return_to_reporting_location}>
              <LocationField id={`${uid}-base`} label="Work reporting location" value={form.work_reporting_location} onChange={set("work_reporting_location")} />
              <p className="mt-1 px-1 text-xs text-ink-3">Leave blank to use the current location as the base.</p>
            </Reveal>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------ Submit */}
      <div className="sticky bottom-0 -mx-1 border-t border-line bg-surface/90 px-1 pt-3 pb-1 backdrop-blur-sm lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <motion.button
          type="submit"
          whileTap={isValid && !isSubmitting ? press : undefined}
          disabled={!isValid || isSubmitting}
          aria-busy={isSubmitting}
          className="focus-ring relative flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-[15px] font-semibold text-accent-ink shadow-[0_1px_2px_rgb(0_0_0/0.18),0_8px_18px_-8px_var(--accent)] transition-[background-color,opacity,box-shadow] duration-150 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
        >
          <AnimatePresence mode="wait" initial={false}>
            {isSubmitting ? (
              <motion.span key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
                Planning route…
              </motion.span>
            ) : justSucceeded ? (
              <motion.span key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={quick} className="flex items-center gap-2">
                <Check size={16} strokeWidth={3} />
                Trip planned
              </motion.span>
            ) : (
              <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}>
                Plan trip
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
        {!isValid && attempted && (
          <p className="mt-2 px-1 text-center text-xs text-red-600 dark:text-red-400" role="status">
            Fix the highlighted fields to plan the trip.
          </p>
        )}
        {onLoadExample && (
          <button
            type="button"
            onClick={onLoadExample}
            className="focus-ring mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium text-ink-3 hover:text-ink"
          >
            <Sparkles size={12} strokeWidth={2.25} aria-hidden="true" />
            Load an example trip
          </button>
        )}
      </div>
    </form>
  )
}
