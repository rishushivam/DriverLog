import type { RouteStop, TripResponse, TripSegment } from "../api/types"

/** Segment datetimes are naive local wall-clock strings ("YYYY-MM-DDTHH:MM:SS"),
 * per the backend's day-bucketing convention — sliced directly rather than
 * parsed through `Date`, which would apply the browser's own timezone. */
export function segmentDateKey(iso: string): string {
  return iso.slice(0, 10)
}

export function segmentMinutesOfDay(iso: string): number {
  const h = Number(iso.slice(11, 13))
  const m = Number(iso.slice(14, 16))
  return h * 60 + m
}

export function formatClock(iso: string): string {
  const minutes = segmentMinutesOfDay(iso)
  const h24 = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const period = h24 >= 12 ? "PM" : "AM"
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  return minutes > 0 ? `${whole} hr ${minutes} min` : `${whole} hr`
}

/** Elapsed hours between two naive local datetime strings. Both endpoints
 * are parsed as UTC purely as a shared arithmetic anchor — the actual
 * timezone is irrelevant to a difference, and this sidesteps both the
 * browser's local-timezone interpretation of unqualified ISO strings and
 * any month/day-rollover bugs from parsing the components by hand. */
export function segmentDurationHours(seg: TripSegment): number {
  return durationBetween(seg.start_datetime, seg.end_datetime)
}

function durationBetween(startIso: string, endIso: string): number {
  const toUtcMs = (iso: string) => {
    const [datePart, timePart] = iso.split("T")
    const [year, month, day] = datePart.split("-").map(Number)
    const [h, m, s] = timePart.split(":").map(Number)
    return Date.UTC(year, month - 1, day, h, m, s || 0)
  }
  return (toUtcMs(endIso) - toUtcMs(startIso)) / 3_600_000
}

export interface OperationalStop {
  segmentIndex: number
  type: RouteStop["type"]
  label: string
  coords: [number, number]
  startIso: string
  durationHours: number
  distanceMiles: number
}

/** Pairs the trip-wide segment list (which carries timing + odometer, but
 * no coordinates) with `route.stops` (which carries geocoded/interpolated
 * coordinates in the same chronological order, one entry ahead because it
 * leads with the trip's current-location marker) so the UI can show a real
 * arrival time, duration, and distance for every operational stop instead
 * of inventing numbers the API never computed. */
export function deriveOperationalStops(trip: TripResponse): OperationalStop[] {
  const stopSegments = trip.segments
    .map((seg, index) => ({ seg, index }))
    .filter(({ seg }) => seg.stop_type !== null)

  const markers = trip.route.stops.slice(1)

  return stopSegments.map(({ seg, index }, i) => ({
    segmentIndex: index,
    type: seg.stop_type as RouteStop["type"],
    // The segment's own location label ("En route, mile 1000" for an
    // engine-triggered stop, the real address for pickup/dropoff) — not
    // `route.stops[].label`, which for engine stops is the remark
    // ("Fuel stop") and would just repeat the type header above it.
    label: seg.location_label,
    coords: markers[i]?.coords ?? trip.route.current_location_coords,
    startIso: seg.start_datetime,
    durationHours: durationBetween(seg.start_datetime, seg.end_datetime),
    distanceMiles: Math.round(seg.odometer_start_miles),
  }))
}

export interface TimelineDay {
  date: string
  segments: Array<{ seg: TripSegment; index: number }>
}

/** Groups the full segment list by calendar day for the timeline — driving
 * blocks included, so the DRIVE / FUEL / DRIVE / REST progression reads as
 * one continuous story instead of only the stops. */
export function groupSegmentsByDay(segments: TripSegment[]): TimelineDay[] {
  const byDate = new Map<string, Array<{ seg: TripSegment; index: number }>>()
  segments.forEach((seg, index) => {
    const key = segmentDateKey(seg.start_datetime)
    const list = byDate.get(key) ?? []
    list.push({ seg, index })
    byDate.set(key, list)
  })
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, segs]) => ({ date, segments: segs }))
}
