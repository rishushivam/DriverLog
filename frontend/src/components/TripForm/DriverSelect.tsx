import { DRIVER_PROFILES } from "../../config/drivers"

interface Props {
  value: string
  onChange: (driverId: string) => void
}

export function DriverSelect({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="driver-select">
        Driver
      </label>
      <select
        id="driver-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors duration-150 focus:border-navy-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40"
      >
        {DRIVER_PROFILES.map((driver) => (
          <option key={driver.id} value={driver.id}>
            {driver.driverName} — {driver.carrierName}
          </option>
        ))}
      </select>
    </div>
  )
}
