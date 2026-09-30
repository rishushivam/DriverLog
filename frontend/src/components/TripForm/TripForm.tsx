import { useState } from "react"
import type { ApiError, CycleSchedule, TripRequest } from "../../api/types"
import { formatLocalDateTime } from "../../utils/localTime"
import { DriverSelect } from "./DriverSelect"
import { LocationField } from "./LocationField"

interface Props {
  onSubmit: (payload: TripRequest) => void
  isSubmitting: boolean
  error: ApiError | null
  driverId: string
  onDriverChange: (driverId: string) => void
}

// "custom" has no fixed cap of its own — its number lives in
// form.custom_cycle_hours instead, see capFor() below.
const NAMED_CYCLE_CAPS: Record<"70/8" | "60/7", number> = { "70/8": 70, "60/7": 60 }
// 49 CFR §395.3(c)'s restart is fixed at 34 consecutive hours off duty —
// this is the form's starting value, not a cap; the field stays editable
// so the tool can explore a different reset length.
const DEFAULT_RESTART_HOURS = "34"

const initialForm = {
  current_location: "",
  pickup_location: "",
  dropoff_location: "",
  current_cycle_used_hours: "",
  cycle_schedule: "70/8" as CycleSchedule,
  custom_cycle_hours: "",
  num_drivers: "1" as "1" | "2",
  co_driver_name: "",
  restart_hours: DEFAULT_RESTART_HOURS,
}

type FormState = typeof initialForm

/** The cap actually in force for whatever's currently selected — a named
 * schedule's fixed number, or the driver's own custom value (undefined
 * until they've typed one, so nothing gets clamped against a false 0). */
function capFor(form: FormState): number | undefined {
  if (form.cycle_schedule === "custom") {
    const custom = Number(form.custom_cycle_hours)
    return custom > 0 ? custom : undefined
  }
  return NAMED_CYCLE_CAPS[form.cycle_schedule]
}

export function TripForm({ onSubmit, isSubmitting, error, driverId, onDriverChange }: Props) {
  const [form, setForm] = useState<FormState>(initialForm)

  function fieldError(field: string): string | undefined {
    return error?.kind === "validation" ? error.fieldErrors?.[field]?.[0] : undefined
  }

  function handleLocationChange(field: keyof FormState) {
    return (value: string) => setForm((f) => ({ ...f, [field]: value }))
  }

  function handleChange(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function handleScheduleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const schedule = e.target.value as CycleSchedule
    setForm((f) => {
      const next = { ...f, cycle_schedule: schedule }
      const cap = capFor(next)
      const currentHours = Number(next.current_cycle_used_hours)
      if (cap != null && currentHours > cap) next.current_cycle_used_hours = String(cap)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      current_location: form.current_location.trim(),
      pickup_location: form.pickup_location.trim(),
      dropoff_location: form.dropoff_location.trim(),
      current_cycle_used_hours: Number(form.current_cycle_used_hours),
      cycle_schedule: form.cycle_schedule,
      custom_cycle_hours: form.cycle_schedule === "custom" ? Number(form.custom_cycle_hours) : undefined,
      num_drivers: form.num_drivers === "2" ? 2 : 1,
      co_driver_name: form.num_drivers === "2" ? form.co_driver_name.trim() : "",
      restart_hours: Number(form.restart_hours),
      client_local_time: formatLocalDateTime(new Date()),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <DriverSelect value={driverId} onChange={onDriverChange} />
      <LocationField
        label="Current location"
        value={form.current_location}
        onChange={handleLocationChange("current_location")}
        error={fieldError("current_location")}
      />
      <LocationField
        label="Pickup location"
        value={form.pickup_location}
        onChange={handleLocationChange("pickup_location")}
        error={fieldError("pickup_location")}
      />
      <LocationField
        label="Dropoff location"
        value={form.dropoff_location}
        onChange={handleLocationChange("dropoff_location")}
        error={fieldError("dropoff_location")}
      />
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="cycle-schedule">
          Cycle schedule
        </label>
        <select
          id="cycle-schedule"
          value={form.cycle_schedule}
          onChange={handleScheduleChange}
          className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors duration-150 focus:border-navy-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40"
        >
          <option value="70/8">70-hour / 8-day</option>
          <option value="60/7">60-hour / 7-day</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      {form.cycle_schedule === "custom" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="custom-cycle-hours">
            Cycle cap (hrs)
          </label>
          <input
            id="custom-cycle-hours"
            type="number"
            min={1}
            max={168}
            step={1}
            required
            value={form.custom_cycle_hours}
            onChange={handleChange("custom_cycle_hours")}
            className="tabular-nums rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors duration-150 focus:border-navy-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40"
          />
          {fieldError("custom_cycle_hours") && (
            <p className="text-xs text-red-700">{fieldError("custom_cycle_hours")}</p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="cycle-hours">
          Current cycle used (hrs)
        </label>
        <input
          id="cycle-hours"
          type="number"
          min={0}
          max={capFor(form)}
          step={0.5}
          required
          value={form.current_cycle_used_hours}
          onChange={handleChange("current_cycle_used_hours")}
          className="tabular-nums rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors duration-150 focus:border-navy-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40"
        />
        {fieldError("current_cycle_used_hours") && (
          <p className="text-xs text-red-700">{fieldError("current_cycle_used_hours")}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="restart-hours">
          Restart duration (hrs)
        </label>
        <input
          id="restart-hours"
          type="number"
          min={1}
          max={168}
          step={1}
          required
          value={form.restart_hours}
          onChange={handleChange("restart_hours")}
          className="tabular-nums rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors duration-150 focus:border-navy-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40"
        />
        {fieldError("restart_hours") ? (
          <p className="text-xs text-red-700">{fieldError("restart_hours")}</p>
        ) : (
          <p className="text-[11px] text-slate-500">§395.3(c) default is 34 — override to explore other reset lengths.</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="num-drivers">
          Number of drivers
        </label>
        <select
          id="num-drivers"
          value={form.num_drivers}
          onChange={(e) => setForm((f) => ({ ...f, num_drivers: e.target.value as "1" | "2" }))}
          className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors duration-150 focus:border-navy-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40"
        >
          <option value="1">1 — solo driver</option>
          <option value="2">2 — team driving</option>
        </select>
      </div>
      {form.num_drivers === "2" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="co-driver-name">
            Co-driver name
          </label>
          <input
            id="co-driver-name"
            type="text"
            value={form.co_driver_name}
            onChange={(e) => setForm((f) => ({ ...f, co_driver_name: e.target.value }))}
            placeholder="Full name"
            className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-150 focus:border-navy-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40"
          />
        </div>
      )}
      <div className="sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-sm bg-navy-600 px-4 py-2 text-sm font-semibold text-white transition-all duration-150 ease-out hover:bg-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
        >
          {isSubmitting && (
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          {isSubmitting ? "Planning your route…" : "Plan trip"}
        </button>
      </div>
    </form>
  )
}
