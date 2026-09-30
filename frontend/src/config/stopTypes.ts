import { BedDouble, Coffee, Flag, Fuel, MapPin, PackageCheck, RotateCcw } from "lucide-react"
import type { CycleSchedule, StopType } from "../api/types"

/** Single source of truth for stop-type color, label, and icon — shared by
 * the route map, the operational stops list, and the trip timeline so the
 * same event reads identically everywhere it appears. */
export const STOP_COLORS: Record<StopType, string> = {
  current: "#1b2a47",
  pickup: "#16a34a",
  dropoff: "#dc2626",
  fuel: "#d97706",
  break: "#7c3aed",
  rest: "#2563eb",
  restart: "#be123c",
}

export const STOP_LABELS: Record<StopType, string> = {
  current: "Current location",
  pickup: "Pickup",
  dropoff: "Dropoff",
  fuel: "Fuel stop",
  break: "30-min break",
  rest: "10-hr rest",
  restart: "34-hr restart",
}

export const STOP_REASONS: Record<StopType, string> = {
  current: "Trip origin",
  pickup: "Load pickup — 1 hr on duty",
  dropoff: "Load dropoff — 1 hr on duty",
  fuel: "Fuel required after 1,000 miles",
  break: "Required 30-minute break after 8 hrs driving",
  rest: "Required 10-hr rest to reset daily driving window",
  restart: "34-hr restart to reset the 70-hr/8-day cycle",
}

export const STOP_ICONS: Record<StopType, typeof MapPin> = {
  current: MapPin,
  pickup: PackageCheck,
  dropoff: Flag,
  fuel: Fuel,
  break: Coffee,
  rest: BedDouble,
  restart: RotateCcw,
}

export const STOP_ORDER: StopType[] = ["current", "pickup", "dropoff", "fuel", "break", "rest", "restart"]

/** The 70/8 vs 60/7 schedule label used anywhere a restart's reason text
 * names which cycle it resets — centralized so it can't drift between the
 * operational-stops list and the ELD log sheet's own tooltip. "custom"
 * isn't a named FMCSA schedule, so it reads its cap straight from the
 * trip's own `cycle_cap_hours` instead of a fixed 70/60. */
export function scheduleLabel(schedule: CycleSchedule, cycleCapHours: number): string {
  if (schedule === "70/8") return "70-hr/8-day"
  if (schedule === "60/7") return "60-hr/7-day"
  return `${cycleCapHours}-hr custom`
}

/** `STOP_LABELS.restart`/`STOP_REASONS.restart` above assume the real
 * 34-hour default — a trip can override that (see `restart_hours` on
 * `TripResponse`), so any surface rendering a restart stop builds its
 * label/reason from the trip's own value instead of reading the static
 * record for this one stop type. */
export function restartLabel(restartHours: number): string {
  return `${restartHours}-hr restart`
}

export function restartReason(restartHours: number, schedule: CycleSchedule, cycleCapHours: number): string {
  return `${restartHours}-hr restart to reset the ${scheduleLabel(schedule, cycleCapHours)} cycle`
}
