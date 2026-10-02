import type { DailyLog } from "../../api/types"

export interface DailyRecap {
  onDutyHoursToday: number
  /** Line A: on duty in the last (N-1) days including today — the hours
   * that will still be inside the N-day window tomorrow. */
  onDutyCountingTomorrow: number
  /** Line B: cap minus line A. */
  cycleHoursAvailableTomorrow: number
  /** Line C: the full N-day window total as of end of today. */
  onDutyLastWindow: number
}

/** Every figure here replays a number the backend already computed
 * (see day_bucketing.py's `_compute_rolling_cycle_at_day_end`), against
 * whichever cap — 70, 60, or a custom value — the trip's `cycle_cap_hours`
 * actually used. Both rolling totals include the pre-trip hours the
 * dispatcher entered, exactly as the engine's own restart decisions do, so
 * the recap can never disagree with the plan. The paper form's own logic:
 * tomorrow's window = (last N-1 days incl. today) + tomorrow, hence line B
 * is cap minus line A, not cap minus the full window. */
export function computeDailyRecap(logs: DailyLog[], dayIndex: number, cycleCapHours: number): DailyRecap {
  const log = logs[dayIndex]
  const onDutyHoursToday = round2((log.totals.DRIVING ?? 0) + (log.totals.ON_DUTY_NOT_DRIVING ?? 0))
  const onDutyCountingTomorrow = log.cycle_hours_counting_tomorrow
  const cycleHoursAvailableTomorrow = round2(Math.max(0, cycleCapHours - onDutyCountingTomorrow))
  const onDutyLastWindow = log.cycle_hours_used_end_of_day
  return { onDutyHoursToday, onDutyCountingTomorrow, cycleHoursAvailableTomorrow, onDutyLastWindow }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
