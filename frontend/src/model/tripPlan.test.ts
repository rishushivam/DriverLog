import { describe, expect, it } from "vitest"
import type { TripRequest, TripResponse } from "../api/types"
import exampleTrip from "../mock/exampleTrip.json"
import { durationBetween, formatDayLabel, formatDistance, formatMarker, formatSpan } from "./format"
import { overlapOffsets, splitRouteByDay } from "./routeGeometry"
import { applyIssueFix, buildTripPlan, SHORT_FINAL_DAY_HOURS } from "./tripPlan"

const trip = exampleTrip as unknown as TripResponse

describe("buildTripPlan — one source of truth", () => {
  const plan = buildTripPlan(trip)

  it("Total trip is elapsed wall-clock time and Days is calendar days touched", () => {
    expect(plan.elapsedHours).toBeCloseTo(trip.route.trip_span_hours, 2)
    expect(plan.calendarDays).toBe(trip.logs.length)
    // A 25.6 h trip touches 2 calendar days: elapsed / 24 rounded up is a
    // lower bound on the days, never a contradiction.
    expect(plan.calendarDays).toBeGreaterThanOrEqual(Math.ceil(plan.elapsedHours / 24))
    expect(plan.days.map((d) => d.date)).toEqual(trip.logs.map((l) => l.date))
  })

  it("elapsed time agrees with the segments when the API field is missing", () => {
    const noSpan = { ...trip, route: { ...trip.route, trip_span_hours: undefined } } as unknown as TripResponse
    const p = buildTripPlan(noSpan)
    const first = trip.segments[0].start_datetime
    const last = trip.segments[trip.segments.length - 1].end_datetime
    expect(p.elapsedHours).toBeCloseTo(durationBetween(first, last), 1)
  })

  it("cycle recap derives from the last log, not re-computed", () => {
    const last = trip.logs[trip.logs.length - 1]
    expect(plan.cycle.usedAtStart).toBe(trip.current_cycle_used_hours)
    expect(plan.cycle.usedAtEnd).toBeCloseTo(last.cycle_hours_used_end_of_day, 2)
    expect(plan.cycle.remainingAtEnd).toBeCloseTo(trip.cycle_cap_hours - last.cycle_hours_used_end_of_day, 2)
    expect(plan.cycle.capHours).toBe(70)
    expect(plan.cycle.schedule).toBe("70-hr/8-day")
  })

  it("every day's totals come from its log and sum to 24 h", () => {
    plan.days.forEach((d) => {
      expect(d.log).not.toBeNull()
      const total = d.driveHours + d.onDutyHours + d.restHours
      expect(total).toBeCloseTo(24, 1)
      expect(d.driveHours).toBeCloseTo(d.log!.totals.DRIVING, 2)
      expect(d.miles).toBe(Math.round(d.log!.total_miles))
    })
  })

  it("restart label and reason use the trip's own restart length", () => {
    const p = buildTripPlan({ ...trip, restart_hours: 36 })
    expect(p.restart.label).toBe("36-hr restart")
    expect(p.restart.reason).toContain("36-hr restart")
    expect(p.restart.used).toBe(false)
  })

  it("flags a mid-shift departure and offers the fresh-rest fix", () => {
    const p = buildTripPlan({ ...trip, driving_hours_today: 3, on_duty_hours_today: 4 })
    const issue = p.issues.find((i) => i.id === "mid-shift")
    expect(issue).toBeDefined()
    expect(issue!.fix.kind).toBe("fresh-rest")
    expect(p.needsReview).toBe(true)
    expect(plan.issues.find((i) => i.id === "mid-shift")).toBeUndefined()
  })

  it("flags a very short final driving day and offers to optimise", () => {
    const shortLast = structuredClone(trip)
    shortLast.logs[shortLast.logs.length - 1].totals.DRIVING = 1.2
    const p = buildTripPlan(shortLast)
    expect(p.shortFinalDay?.driveHours).toBeLessThan(SHORT_FINAL_DAY_HOURS)
    const issue = p.issues.find((i) => i.id === "short-final-day")
    expect(issue?.fix.kind).toBe("shift-departure")
    // Info-level only: it does not flip the compliance badge.
    expect(issue?.severity).toBe("info")
  })

  it("odometer ranges per day are monotonic and cover the route", () => {
    const ranges = plan.days.map((d) => [d.odometerStart, d.odometerEnd])
    expect(ranges[0][0]).toBe(0)
    expect(ranges[ranges.length - 1][1]).toBeCloseTo(trip.route.distance_miles, 0)
    for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBeGreaterThanOrEqual(ranges[i - 1][1] - 1e-6)
  })
})

describe("applyIssueFix", () => {
  const request: TripRequest = {
    current_location: "Chicago, IL",
    pickup_location: "Nashville, TN",
    dropoff_location: "Atlanta, GA",
    current_cycle_used_hours: 38,
    cycle_schedule: "70/8",
    num_drivers: 1,
    co_driver_name: "",
    restart_hours: 34,
    driving_hours_today: 3,
    on_duty_hours_today: 4,
    client_local_time: "2026-10-02T06:30:00",
  }
  it("fresh-rest zeroes today's hours", () => {
    const r = applyIssueFix(request, { kind: "fresh-rest", label: "" })
    expect(r.driving_hours_today).toBe(0)
    expect(r.on_duty_hours_today).toBe(0)
  })
  it("shift-departure moves the local clock earlier without touching the timezone", () => {
    const r = applyIssueFix(request, { kind: "shift-departure", label: "", hours: 2.5 })
    expect(r.client_local_time).toBe("2026-10-02T04:00:00")
    const across = applyIssueFix({ ...request, client_local_time: "2026-10-02T01:00:00" }, { kind: "shift-departure", label: "", hours: 2 })
    expect(across.client_local_time).toBe("2026-10-01T23:00:00")
  })
})

describe("format", () => {
  it("one human date format", () => {
    expect(formatDayLabel("2026-10-02")).toMatch(/Fri, Oct 2/)
  })
  it("elapsed span", () => {
    expect(formatSpan(25.63)).toBe("1d 1.6h")
    expect(formatSpan(13.1)).toBe("13.1 h")
  })
  it("units", () => {
    expect(formatDistance(100, "mi")).toBe("100 mi")
    expect(formatDistance(100, "km")).toBe("161 km")
    expect(formatMarker(440, "km")).toBe("km 708")
  })
})

describe("routeGeometry", () => {
  it("splits the route into one coloured piece per driving day", () => {
    const plan = buildTripPlan(trip)
    const pieces = splitRouteByDay(trip.route, plan.days)
    expect(pieces.length).toBe(plan.days.length)
    const start = pieces[0].positions[0]
    expect(start[0]).toBeCloseTo(trip.route.current_location_coords[1], 3)
    const end = pieces[pieces.length - 1].positions.at(-1)!
    expect(end[0]).toBeCloseTo(trip.route.dropoff_location_coords[1], 3)
  })
  it("offsets markers that share a coordinate", () => {
    const o = overlapOffsets([
      [0, 0],
      [0, 0],
      [5, 5],
    ])
    expect(o[2]).toEqual([0, 0])
    expect(o[0]).not.toEqual(o[1])
  })
})
