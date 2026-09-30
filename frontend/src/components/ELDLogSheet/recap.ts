import type { DailyLog } from "../../api/types"

const TRAILING_WINDOW_DAYS = 5

export interface DailyRecap {
  onDutyHoursToday: number
  cycleHoursUsed: number
  cycleHoursAvailableTomorrow: number
  onDutyHoursLastWindow: number
}

/** All figures here replay numbers the backend already computed
 * (`cycle_hours_used_end_of_day` mirrors the engine's own cycle bookkeeping
 * exactly, against whichever cap — 70, 60, or a custom value — the trip's
 * `cycle_cap_hours` actually used, see day_bucketing.py) rather than
 * re-deriving HOS rules on the frontend, with one exception: the
 * trailing-N-day on-duty sum, which is a plain sum over `logs` and carries
 * no compliance decision of its own. */
export function computeDailyRecap(logs: DailyLog[], dayIndex: number, cycleCapHours: number): DailyRecap {
  const log = logs[dayIndex]
  const onDutyHoursToday = round2((log.totals.DRIVING ?? 0) + (log.totals.ON_DUTY_NOT_DRIVING ?? 0))
  const cycleHoursUsed = log.cycle_hours_used_end_of_day
  const cycleHoursAvailableTomorrow = round2(Math.max(0, cycleCapHours - cycleHoursUsed))

  const windowStart = Math.max(0, dayIndex - TRAILING_WINDOW_DAYS + 1)
  const onDutyHoursLastWindow = round2(
    logs.slice(windowStart, dayIndex + 1).reduce((sum, l) => sum + (l.totals.DRIVING ?? 0) + (l.totals.ON_DUTY_NOT_DRIVING ?? 0), 0),
  )

  return { onDutyHoursToday, cycleHoursUsed, cycleHoursAvailableTomorrow, onDutyHoursLastWindow }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
