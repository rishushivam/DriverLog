/** Every human-readable date, time, duration and distance in the UI goes
 * through this file so there is exactly one format for each. Segment and
 * log datetimes are naive local wall-clock strings ("YYYY-MM-DDTHH:MM:SS")
 * anchored to the driver's own clock — they are sliced, never parsed
 * through `Date`, which would apply the browser's timezone twice. */

export type Units = "mi" | "km"

const KM_PER_MILE = 1.609344

export function toUnits(miles: number, units: Units): number {
  return units === "km" ? miles * KM_PER_MILE : miles
}

export function formatDistance(miles: number, units: Units, digits = 0): string {
  const v = toUnits(miles, units)
  return `${v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units}`
}

/** "mile 440" / "km 708" — the secondary odometer marker on timeline rows. */
export function formatMarker(miles: number, units: Units): string {
  return `${units === "km" ? "km" : "mile"} ${Math.round(toUnits(miles, units))}`
}

export function dateKeyOf(iso: string): string {
  return iso.slice(0, 10)
}

export function minutesOfDay(iso: string): number {
  const h = Number(iso.slice(11, 13))
  const m = Number(iso.slice(14, 16))
  return h * 60 + m
}

/** Weekday + short month + day: "Fri, Oct 2". Parsed by components so the
 * date never shifts across a timezone boundary. */
export function formatDayLabel(dateKey: string, withYear = false): string {
  const [y, m, d] = dateKey.slice(0, 10).split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  })
}

export function formatClock(iso: string): string {
  const minutes = minutesOfDay(iso)
  const h24 = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const period = h24 >= 12 ? "PM" : "AM"
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

/** "Fri, Oct 2 · 6:30 AM" */
export function formatDateTime(iso: string): string {
  return `${formatDayLabel(iso)} · ${formatClock(iso)}`
}

export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  if (minutes === 60) return `${whole + 1} hr`
  return minutes > 0 ? `${whole} hr ${minutes} min` : `${whole} hr`
}

/** Compact hours: "13.1 h" or "1d 1.6h". */
export function formatSpan(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)} h`
  const days = Math.floor(hours / 24)
  const rest = hours - days * 24
  return `${days}d ${rest.toFixed(1)}h`
}

export function formatHours(hours: number, digits = 1): string {
  return `${hours.toFixed(digits)} h`
}

/** The driver's timezone as the browser reports it, e.g. "CDT" and
 * "America/Chicago". The trip was anchored to this clock at submit time. */
export function currentTimezone(): { short: string; long: string } {
  try {
    const long = Intl.DateTimeFormat().resolvedOptions().timeZone
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date())
    const short = parts.find((p) => p.type === "timeZoneName")?.value ?? long
    return { short, long }
  } catch {
    return { short: "local", long: "local time" }
  }
}

export function durationBetween(startIso: string, endIso: string): number {
  const toUtcMs = (iso: string) => {
    const [datePart, timePart] = iso.split("T")
    const [year, month, day] = datePart.split("-").map(Number)
    const [h, m, s] = (timePart ?? "00:00:00").split(":").map(Number)
    return Date.UTC(year, month - 1, day, h, m, Math.floor(s || 0))
  }
  return (toUtcMs(endIso) - toUtcMs(startIso)) / 3_600_000
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
