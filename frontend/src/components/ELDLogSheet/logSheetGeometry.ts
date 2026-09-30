import type { DailyLogRemark, DailyLogSegment, DutyStatus } from "../../api/types"

export const GRID_X_START = 150
export const GRID_X_END = 870
export const GRID_WIDTH = GRID_X_END - GRID_X_START
export const ROW_HEIGHT = 40
export const HOUR_BAND_HEIGHT = 20
export const GRID_Y_START = 48
export const ROW_ORDER: DutyStatus[] = ["OFF_DUTY", "SLEEPER_BERTH", "DRIVING", "ON_DUTY_NOT_DRIVING"]
export const ROW_NUMBERS: Record<DutyStatus, string> = {
  OFF_DUTY: "1.",
  SLEEPER_BERTH: "2.",
  DRIVING: "3.",
  ON_DUTY_NOT_DRIVING: "4.",
}
export const ROW_LABELS: Record<DutyStatus, string[]> = {
  OFF_DUTY: ["Off Duty"],
  SLEEPER_BERTH: ["Sleeper Berth"],
  DRIVING: ["Driving"],
  ON_DUTY_NOT_DRIVING: ["On Duty", "(not driving)"],
}
export const GRID_Y_END = GRID_Y_START + ROW_ORDER.length * ROW_HEIGHT
export const TOTALS_X_START = 880
export const TOTALS_X_END = 995

export function parseLogDate(isoDate: string): { month: string; day: string; year: string } {
  const [year, month, day] = isoDate.split("-")
  return { month, day, year }
}

/** "4h 30m" between two "HH:MM"/"24:00" strings, for the graph's hover
 * tooltip — reuses timeToMinutes so it agrees with everything else drawn
 * from the same field. */
export function formatHHMMDuration(startTime: string, endTime: string): string {
  const minutes = timeToMinutes(endTime) - timeToMinutes(startTime)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h <= 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function timeToMinutes(hhmm: string): number {
  if (hhmm === "24:00") return 24 * 60
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

export function xForMinutes(minutes: number): number {
  return GRID_X_START + (minutes / (24 * 60)) * GRID_WIDTH
}

export function yForRow(status: DutyStatus): number {
  const index = ROW_ORDER.indexOf(status)
  return GRID_Y_START + index * ROW_HEIGHT + ROW_HEIGHT / 2
}

/** One continuous step path across the day's contiguous segments — a single
 * SVG path draws the classic "square waveform across 4 lanes" RODS look. */
export function buildStepPath(segments: DailyLogSegment[]): string {
  if (segments.length === 0) return ""
  let d = ""
  segments.forEach((seg, i) => {
    const x1 = xForMinutes(timeToMinutes(seg.start_time))
    const x2 = xForMinutes(timeToMinutes(seg.end_time))
    const y = yForRow(seg.status)
    d += i === 0 ? `M ${x1} ${y} ` : `V ${y} `
    d += `H ${x2} `
  })
  return d.trim()
}

export function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return "Mid"
  if (hour === 12) return "Noon"
  return String(hour > 12 ? hour - 12 : hour)
}

export interface DisplayRemark {
  time: string
  location_label: string
  notes: string[]
}

const MERGE_THRESHOLD_PX = 35

/** Two status changes minutes apart (a fuel stop immediately followed by
 * resuming driving, say) share the same real-world location — rendering
 * them as one merged label is both the fix for label overlap and the more
 * accurate reading, not just a cosmetic patch. Consecutive remarks within
 * MERGE_THRESHOLD_PX collapse into one entry at the first one's position,
 * concatenating whichever notes exist. */
export function groupCloseRemarks(remarks: DailyLogRemark[]): DisplayRemark[] {
  const sorted = [...remarks].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
  const groups: DisplayRemark[] = []
  for (const r of sorted) {
    const x = xForMinutes(timeToMinutes(r.time))
    const last = groups[groups.length - 1]
    if (last && x - xForMinutes(timeToMinutes(last.time)) < MERGE_THRESHOLD_PX) {
      if (r.note) last.notes.push(r.note)
      continue
    }
    groups.push({ time: r.time, location_label: r.location_label, notes: r.note ? [r.note] : [] })
  }
  return groups
}
