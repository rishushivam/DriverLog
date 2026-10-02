import { AnimatePresence, motion } from "framer-motion"
import { Check, Clock, History, RotateCcw, Route, ShieldCheck, Sparkles, Timer, Trash2, Users } from "lucide-react"
import { useEffect, useId, useImperativeHandle, useMemo, useState, type Ref } from "react"
import type { ApiError, CycleSchedule, TripRequest } from "../../api/types"
import { DRIVER_PROFILES } from "../../config/drivers"
import type { RecentTrip } from "../../hooks/useRecentTrips"
import type { TripPlan } from "../../model/tripPlan"
import { Button } from "../ui/Button"
import { Collapsible } from "../ui/Collapsible"
import { Field } from "../ui/Field"
import { ProgressBar } from "../ui/ProgressBar"
import { Reveal } from "../ui/Reveal"
import { SegmentedControl } from "../ui/SegmentedControl"
import { Switch } from "../ui/Switch"
import { quick } from "../ui/motion"
import { CycleSlider } from "./CycleSlider"
import { capFor, DEFAULT_RESTART_HOURS, fromRequest, initialForm, num, toRequest, validate, type FormState } from "./formState"
import { RouteStops, type StopKey } from "./RouteStops"

export type FormSection = "driver" | "route" | "hours" | "rules"
export const FORM_SECTIONS: Array<{ id: FormSection; label: string; icon: typeof Users }> = [
  { id: "driver", label: "Driver", icon: Users },
  { id: "route", label: "Route", icon: Route },
  { id: "hours", label: "Hours & Cycle", icon: Timer },
  { id: "rules", label: "Rules & exceptions", icon: ShieldCheck },
]

export interface TripFormHandle {
  /** Load a request (share link, recent trip, issue fix) into the form. */
  load: (request: TripRequest) => void
  openSection: (section: FormSection) => void
}

interface Props {
  onSubmit: (payload: TripRequest) => void
  onReset: () => void
  isSubmitting: boolean
  justSucceeded: boolean
  error: ApiError | null
  driverId: string
  onDriverChange: (driverId: string) => void
  onLoadExample?: () => void
  plan: TripPlan | null
  recentTrips: RecentTrip[]
  onRemoveRecent: (id: string) => void
  handle?: Ref<TripFormHandle>
}

const STOP_KEYS: StopKey[] = ["current_location", "pickup_location", "dropoff_location"]

export function TripForm({ onSubmit, onReset, isSubmitting, justSucceeded, error, driverId, onDriverChange, onLoadExample, plan, recentTrips, onRemoveRecent, handle }: Props) {
  const uid = useId()
  const [form, setForm] = useState<FormState>(initialForm)
  const [geocoded, setGeocoded] = useState<Record<string, boolean>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [attempted, setAttempted] = useState(false)
  const [open, setOpen] = useState<Record<FormSection, boolean>>({ driver: true, route: true, hours: true, rules: false })
  const [shiftOpen, setShiftOpen] = useState(false)

  const clientErrors = useMemo(() => validate(form), [form])
  const isValid = Object.keys(clientErrors).length === 0

  useImperativeHandle(handle, () => ({
    load: (request) => {
      setForm(fromRequest(request))
      setGeocoded({})
      setTouched({})
      setAttempted(false)
      setShiftOpen((request.driving_hours_today ?? 0) + (request.on_duty_hours_today ?? 0) > 0)
    },
    openSection: (section) => {
      setOpen((o) => ({ ...o, [section]: true }))
      requestAnimationFrame(() => document.getElementById(`${uid}-section-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" }))
    },
  }))

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
  const toggleSection = (s: FormSection) => () => setOpen((o) => ({ ...o, [s]: !o[s] }))

  function changeSchedule(schedule: CycleSchedule) {
    setForm((f) => {
      const next = { ...f, cycle_schedule: schedule }
      const cap = capFor(next)
      if (cap != null && Number(next.current_cycle_used_hours) > cap) next.current_cycle_used_hours = String(cap)
      if (cap != null && Number(next.co_driver_cycle_used_hours) > cap) next.co_driver_cycle_used_hours = String(cap)
      return next
    })
  }

  function reorderStops(from: number, to: number) {
    setForm((f) => {
      const values = STOP_KEYS.map((k) => f[k])
      const [moved] = values.splice(from, 1)
      values.splice(to, 0, moved)
      const next = { ...f }
      STOP_KEYS.forEach((k, i) => (next[k] = values[i]))
      return next
    })
    setGeocoded((g) => {
      const flags = STOP_KEYS.map((k) => !!g[k])
      const [moved] = flags.splice(from, 1)
      flags.splice(to, 0, moved)
      const next = { ...g }
      STOP_KEYS.forEach((k, i) => (next[k] = flags[i]))
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)
    if (!isValid) {
      // Open whichever section holds the first error so it is visible.
      const first = Object.keys(clientErrors)[0]
      const section: FormSection = STOP_KEYS.includes(first as StopKey) ? "route" : first.startsWith("co_") ? "driver" : ["return_to_reporting_location", "sixteen_hour_attestation"].includes(first) ? "rules" : "hours"
      setOpen((o) => ({ ...o, [section]: true }))
      return
    }
    onSubmit(toRequest(form))
  }

  function handleReset() {
    setForm(initialForm)
    setGeocoded({})
    setTouched({})
    setAttempted(false)
    setShiftOpen(false)
    onReset()
  }

  const cap = capFor(form) ?? 70
  const driver = DRIVER_PROFILES.find((d) => d.id === driverId) ?? DRIVER_PROFILES[0]
  const driverSummary = `${driver.driverName} · ${form.num_drivers === "2" ? `Team with ${form.co_driver_name.trim() || "co-driver"}` : "Solo"}`
  const routeSummary = [form.current_location, form.pickup_location, form.dropoff_location].map((s) => s.trim()).filter(Boolean).join(" → ") || "No route yet"
  const scheduleWord = form.cycle_schedule === "custom" ? `${form.custom_cycle_hours || "—"} hr / ${form.custom_cycle_days || "—"} day` : form.cycle_schedule === "70/8" ? "70 hr / 8 day" : "60 hr / 7 day"
  const hoursSummary = `${scheduleWord} · ${form.current_cycle_used_hours || 0} h used · ${form.custom_restart ? form.restart_hours : DEFAULT_RESTART_HOURS}-hr restart`
  const modeValue =
    form.operating_mode === "short_haul_cdl" ? "CDL short-haul" : form.operating_mode === "short_haul_non_cdl" ? "Non-CDL short-haul" : form.use_16_hour_exception ? "Standard + 16-hr exception" : "Standard rules"
  const returnLegRequired = form.operating_mode !== "standard" || form.use_16_hour_exception
  const windowUsed = (num(form.driving_hours_today) ?? 0) + (num(form.on_duty_hours_today) ?? 0)
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm)

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Trip details" className="flex min-h-full flex-col">
      <div className="flex flex-col gap-3 pb-4">
        {/* ------------------------------------------------ Driver */}
        <Collapsible id={`${uid}-section-driver`} title="Driver" icon={<Users size={15} aria-hidden="true" />} summary={driverSummary} open={open.driver} onToggle={toggleSection("driver")}>
          <div className="space-y-3">
            <div className="float-field relative rounded-xl border border-line bg-surface transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--accent-soft)]">
              <select id={`${uid}-driver`} value={driverId} onChange={(e) => onDriverChange(e.target.value)} className="peer w-full appearance-none rounded-xl bg-transparent px-3.5 pt-5 pb-1.5 pr-9 text-[15px] text-ink outline-none">
                {DRIVER_PROFILES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.driverName} — {d.carrierName}
                  </option>
                ))}
              </select>
              <label htmlFor={`${uid}-driver`} className="pointer-events-none absolute top-1/2 left-3.5 origin-left -translate-y-1/2 text-sm text-ink-2">
                Driver profile
              </label>
              <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-ink-3">
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Crew</span>
              <SegmentedControl
                name="num-drivers"
                aria-label="Crew"
                value={form.num_drivers}
                onChange={(v) => setForm((f) => ({ ...f, num_drivers: v }))}
                options={[
                  { value: "1", label: "Solo" },
                  { value: "2", label: "Team" },
                ]}
              />
            </div>
            <Reveal open={form.num_drivers === "2"}>
              <div className="space-y-3 rounded-xl border border-dashed border-line-strong p-3">
                <Field id={`${uid}-co-name`} label="Co-driver name" value={form.co_driver_name} onChange={(e) => set("co_driver_name")(e.target.value)} />
                <Field
                  id={`${uid}-co-cycle`}
                  label="Co-driver's cycle used"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={cap}
                  step={0.5}
                  unit="h"
                  value={form.co_driver_cycle_used_hours}
                  onChange={(e) => set("co_driver_cycle_used_hours")(e.target.value)}
                  onBlur={touch("co_driver_cycle_used_hours")}
                  error={fieldError("co_driver_cycle_used_hours")}
                  hint="The co-driver is assumed rested at departure."
                />
              </div>
            </Reveal>
          </div>
        </Collapsible>

        {/* ------------------------------------------------ Route */}
        <Collapsible id={`${uid}-section-route`} title="Route" icon={<Route size={15} aria-hidden="true" />} summary={routeSummary} open={open.route} onToggle={toggleSection("route")}>
          <RouteStops
            uid={uid}
            stops={{
              current_location: { value: form.current_location, geocoded: !!geocoded.current_location },
              pickup_location: { value: form.pickup_location, geocoded: !!geocoded.pickup_location },
              dropoff_location: { value: form.dropoff_location, geocoded: !!geocoded.dropoff_location },
            }}
            onStopChange={(key, value, g) => {
              set(key)(value)
              setGeocoded((prev) => ({ ...prev, [key]: g }))
              if (value.trim().length >= 3) setTouched((t) => ({ ...t, [key]: true }))
            }}
            onReorder={reorderStops}
            errors={{ current_location: fieldError("current_location"), pickup_location: fieldError("pickup_location"), dropoff_location: fieldError("dropoff_location") }}
            returnLeg={{ enabled: form.return_to_reporting_location, value: form.work_reporting_location, geocoded: !!geocoded.base, error: fieldError("return_to_reporting_location") }}
            onReturnLegChange={(next) => {
              setForm((f) => ({
                ...f,
                return_to_reporting_location: next.enabled ?? f.return_to_reporting_location,
                work_reporting_location: next.value ?? f.work_reporting_location,
              }))
              if (next.geocoded != null) setGeocoded((g) => ({ ...g, base: next.geocoded! }))
            }}
            returnLegRequired={returnLegRequired}
          />
          {recentTrips.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">
                <History size={12} aria-hidden="true" />
                Recent trips
              </p>
              <ul className="space-y-1">
                {recentTrips.slice(0, 4).map((t) => (
                  <li key={t.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setForm(fromRequest(t.request))
                        setGeocoded({})
                        setAttempted(false)
                      }}
                      className="focus-ring min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                      title={t.label}
                    >
                      {t.label}
                    </button>
                    <button type="button" onClick={() => onRemoveRecent(t.id)} aria-label={`Remove ${t.label} from recent trips`} className="focus-ring rounded-md p-1 text-ink-3 hover:bg-surface-3 hover:text-danger">
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Collapsible>

        {/* ------------------------------------------------ Hours & Cycle */}
        <Collapsible id={`${uid}-section-hours`} title="Hours & Cycle" icon={<Timer size={15} aria-hidden="true" />} summary={hoursSummary} open={open.hours} onToggle={toggleSection("hours")}>
          <div className="space-y-3">
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Cycle schedule</span>
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
                  <Field id={`${uid}-custom-hrs`} label="Cycle cap" type="number" inputMode="numeric" min={1} max={168} unit="h" value={form.custom_cycle_hours} onChange={(e) => set("custom_cycle_hours")(e.target.value)} onBlur={touch("custom_cycle_hours")} error={fieldError("custom_cycle_hours")} />
                  <Field id={`${uid}-custom-days`} label="Window" type="number" inputMode="numeric" min={1} max={30} unit="days" value={form.custom_cycle_days} onChange={(e) => set("custom_cycle_days")(e.target.value)} onBlur={touch("custom_cycle_days")} error={fieldError("custom_cycle_days")} />
                </div>
              </Reveal>
            </div>

            <CycleSlider
              id={`${uid}-cycle`}
              label={form.num_drivers === "2" ? "Driver's cycle hours used" : "Cycle hours used"}
              value={form.current_cycle_used_hours}
              cap={cap}
              onChange={(v) => {
                set("current_cycle_used_hours")(v)
                setTouched((t) => ({ ...t, current_cycle_used_hours: true }))
              }}
              error={fieldError("current_cycle_used_hours")}
            />

            <Switch
              id={`${uid}-custom-restart`}
              checked={form.custom_restart}
              onChange={(checked) => setForm((f) => ({ ...f, custom_restart: checked, restart_hours: checked ? f.restart_hours : String(DEFAULT_RESTART_HOURS) }))}
              label="Custom restart duration"
              hint={form.custom_restart ? "What-if only: the regulation sets 34 h." : `Uses the ${DEFAULT_RESTART_HOURS}-hr restart when the cycle cap is reached.`}
            />
            <Reveal open={form.custom_restart}>
              <Field
                id={`${uid}-restart`}
                label="Restart duration"
                type="number"
                inputMode="numeric"
                min={10}
                max={168}
                unit="h"
                value={form.restart_hours}
                onChange={(e) => set("restart_hours")(e.target.value)}
                onBlur={touch("restart_hours")}
                error={fieldError("restart_hours")}
                hint="10 is the shortest break that clears the daily clocks; 168 is the maximum."
              />
            </Reveal>

            <button
              type="button"
              onClick={() => setShiftOpen((o) => !o)}
              aria-expanded={shiftOpen}
              aria-controls={`${uid}-shift-panel`}
              className="focus-ring flex w-full items-center justify-between rounded-lg px-1 py-1 text-left text-[13px] font-medium text-ink-2 hover:text-ink"
            >
              <span className="flex items-center gap-1.5">
                <Clock size={13} aria-hidden="true" />
                {form.num_drivers === "2" ? "Driver already on shift today?" : "Already on shift today?"}
              </span>
              <span className="text-xs text-accent-700 dark:text-accent-300">{shiftOpen ? "Hide" : windowUsed > 0 ? `Edit · ${windowUsed} h` : "Add hours"}</span>
            </button>
            <Reveal open={shiftOpen} id={`${uid}-shift-panel`}>
              <div className="grid grid-cols-2 gap-3">
                <Field id={`${uid}-drv-today`} label="Driving" type="number" inputMode="decimal" min={0} max={11} step={0.25} unit="h" value={form.driving_hours_today} onChange={(e) => set("driving_hours_today")(e.target.value)} onBlur={touch("driving_hours_today")} error={fieldError("driving_hours_today")} />
                <Field id={`${uid}-od-today`} label="Non-driving duty" type="number" inputMode="decimal" min={0} max={14} step={0.25} unit="h" value={form.on_duty_hours_today} onChange={(e) => set("on_duty_hours_today")(e.target.value)} onBlur={touch("on_duty_hours_today")} error={fieldError("on_duty_hours_today")} />
              </div>
              <p className="mt-2 px-1 text-[13px] text-ink-3">
                Since the last 10-hour rest. Together they are the 14-hour window already used{windowUsed > 0 && <span className="num text-ink-2"> ({windowUsed} h)</span>}. These hours are already inside the cycle total.
              </p>
            </Reveal>

            {plan && (
              <div className="rounded-xl border border-line bg-surface-2 p-3" aria-label="Cycle after this plan">
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="font-medium text-ink-2">After this trip</span>
                  <span className="num text-ink">
                    {plan.cycle.usedAtEnd.toFixed(1)} / {plan.cycle.capHours} h
                  </span>
                </div>
                <ProgressBar value={plan.cycle.usedAtEnd} max={plan.cycle.capHours} label="Cycle hours after this trip" className="mt-1.5" />
                <p className="num mt-1.5 text-[13px] text-ink-3">
                  {plan.cycle.remainingAtEnd.toFixed(1)} h remaining on the {plan.cycle.schedule} cycle
                  {plan.restart.used ? ` · ${plan.restart.label} included` : ""}
                </p>
              </div>
            )}
          </div>
        </Collapsible>

        {/* ------------------------------------------------ Rules */}
        <Collapsible id={`${uid}-section-rules`} title="Rules & exceptions" icon={<ShieldCheck size={15} aria-hidden="true" />} summary={modeValue} open={open.rules} onToggle={toggleSection("rules")}>
          <div className="space-y-3">
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
            <p className="px-1 text-[13px] text-ink-3">
              {form.operating_mode === "standard"
                ? "Standard rules: 11 h driving in a 14 h window with a 30-min break after 8 h of driving."
                : form.operating_mode === "short_haul_cdl"
                  ? "CDL short-haul: stay within 150 air-miles of base, be back and released within 14 h, no 30-min break. A time record replaces the log."
                  : "Non-CDL short-haul: stay within 150 air-miles of base, no 30-min break, drive until the 14th hour — or the 16th on 2 days per week."}
            </p>
            <Reveal open={form.operating_mode === "short_haul_non_cdl"}>
              <Field id={`${uid}-days-14`} label="Days this week already past the 14th hour" type="number" inputMode="numeric" min={0} max={2} step={1} unit="of 2" value={form.days_past_14th_hour_this_week} onChange={(e) => set("days_past_14th_hour_this_week")(e.target.value)} hint="Non-CDL short-haul allows driving to the 16th hour on at most 2 days in any 7." />
            </Reveal>

            {form.operating_mode === "standard" && (
              <Switch
                id={`${uid}-16h`}
                checked={form.use_16_hour_exception}
                onChange={(checked) => setForm((f) => ({ ...f, use_16_hour_exception: checked, return_to_reporting_location: checked ? true : f.return_to_reporting_location }))}
                label="Use the 16-hour exception today"
                hint="The 14-hour window stretches to 16 h once every 7 days for a driver who returns to base."
              />
            )}
            <Reveal open={form.use_16_hour_exception && form.operating_mode === "standard"}>
              <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${fieldError("sixteen_hour_attestation") ? "border-danger" : "border-dashed border-line-strong"}`}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={form.sixteen_hour_attestation} onChange={(e) => setForm((f) => ({ ...f, sixteen_hour_attestation: e.target.checked }))} onBlur={touch("sixteen_hour_attestation")} />
                <span className="text-[13px] leading-snug text-ink-2">I confirm the driver returned to the work reporting location on the last 5 duty tours and has not used this exception in the past 7 days (or has taken a 34-hour restart since).</span>
              </label>
              {fieldError("sixteen_hour_attestation") && <p className="mt-1 px-1 text-[13px] text-danger">{fieldError("sixteen_hour_attestation")}</p>}
            </Reveal>
            {returnLegRequired && !form.return_to_reporting_location && <p className="px-1 text-[13px] text-danger">{fieldError("return_to_reporting_location")}</p>}
          </div>
        </Collapsible>

        {onLoadExample && (
          <button type="button" onClick={onLoadExample} className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
            <Sparkles size={13} strokeWidth={2.25} aria-hidden="true" />
            Load an example trip
          </button>
        )}
      </div>

      {/* ------------------------------------------------ Sticky action bar */}
      <div className="sticky bottom-0 z-10 mt-auto -mx-4 border-t border-line bg-surface/90 px-4 pt-3 pb-3 backdrop-blur-sm" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="lg" disabled={!isValid || isSubmitting} loading={isSubmitting} className="flex-1">
            <AnimatePresence mode="wait" initial={false}>
              {isSubmitting ? (
                <motion.span key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}>
                  Planning route…
                </motion.span>
              ) : justSucceeded ? (
                <motion.span key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={quick} className="flex items-center gap-2">
                  <Check size={16} strokeWidth={3} aria-hidden="true" />
                  Trip planned
                </motion.span>
              ) : (
                <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}>
                  Plan trip
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
          <Button type="button" variant="secondary" size="lg" onClick={handleReset} disabled={isSubmitting || (!isDirty && !plan)} leading={<RotateCcw size={15} aria-hidden="true" />}>
            Reset
          </Button>
        </div>
        {!isValid && attempted && (
          <p className="mt-2 px-1 text-center text-[13px] text-danger" role="status">
            Fix the highlighted fields to plan the trip.
          </p>
        )}
      </div>
    </form>
  )
}
