import type { TripRoute } from "../api/types"
import type { PlanDay } from "./tripPlan"

export type LngLat = [number, number]
export type LatLng = [number, number]

const EARTH_RADIUS_MI = 3958.7613

function haversineMiles(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const la1 = toRad(a[1])
  const la2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h))
}

export function fullRouteLine(route: TripRoute): LngLat[] {
  return [...route.geometry.to_pickup, ...route.geometry.to_dropoff, ...(route.geometry.to_reporting ?? [])]
}

export interface DaySegmentLine {
  dayIndex: number
  positions: LatLng[]
}

/** Splits the route polyline into one piece per calendar day using each
 * day's odometer range. Point distances are scaled so the polyline's own
 * length matches the engine's road distance, which keeps the split points
 * aligned with the odometer-based stop markers. */
export function splitRouteByDay(route: TripRoute, days: PlanDay[]): DaySegmentLine[] {
  const line = fullRouteLine(route)
  if (line.length < 2) return []
  const cum: number[] = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversineMiles(line[i - 1], line[i]))
  const geomLength = cum[cum.length - 1] || 1
  const scale = route.distance_miles > 0 ? route.distance_miles / geomLength : 1
  const scaled = cum.map((c) => c * scale)

  const pointAt = (mile: number): LngLat => {
    if (mile <= 0) return line[0]
    if (mile >= scaled[scaled.length - 1]) return line[line.length - 1]
    let i = 1
    while (i < scaled.length && scaled[i] < mile) i++
    const t = (mile - scaled[i - 1]) / Math.max(scaled[i] - scaled[i - 1], 1e-9)
    return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]
  }

  const slices: DaySegmentLine[] = []
  const drivingDays = days.filter((d) => d.odometerEnd > d.odometerStart)
  if (drivingDays.length === 0) return [{ dayIndex: 0, positions: line.map(([lng, lat]) => [lat, lng]) }]
  drivingDays.forEach((day) => {
    const from = day.odometerStart
    const to = day.odometerEnd
    const pts: LngLat[] = [pointAt(from)]
    for (let i = 0; i < line.length; i++) {
      if (scaled[i] > from && scaled[i] < to) pts.push(line[i])
    }
    pts.push(pointAt(to))
    slices.push({ dayIndex: day.index, positions: pts.map(([lng, lat]) => [lat, lng]) })
  })
  return slices
}

/** Offsets markers that would sit on top of each other (a break placed at
 * the pickup, a rest at the dropoff) so each one stays clickable. Returns a
 * pixel offset per marker index. Deterministic and zoom-independent. */
export function overlapOffsets(coords: LngLat[], thresholdDeg = 0.004): Array<[number, number]> {
  const offsets: Array<[number, number]> = coords.map(() => [0, 0])
  const groups: number[][] = []
  coords.forEach((c, i) => {
    const g = groups.find((grp) => {
      const o = coords[grp[0]]
      return Math.abs(o[0] - c[0]) < thresholdDeg && Math.abs(o[1] - c[1]) < thresholdDeg
    })
    if (g) g.push(i)
    else groups.push([i])
  })
  groups.forEach((g) => {
    if (g.length < 2) return
    g.forEach((idx, k) => {
      const angle = (k / g.length) * Math.PI * 2 - Math.PI / 2
      const r = 18
      offsets[idx] = [Math.round(Math.cos(angle) * r), Math.round(Math.sin(angle) * r)]
    })
  })
  return offsets
}

/** Day colours for the route line: a short, colour-blind-friendly ramp. */
export const DAY_COLORS = ["#d97b06", "#2563eb", "#16a34a", "#7c3aed", "#0d9488", "#dc2626", "#be123c", "#0891b2"]
export function dayColor(i: number): string {
  return DAY_COLORS[i % DAY_COLORS.length]
}
