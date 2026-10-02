import { motion } from "framer-motion"
import { useCallback, useMemo, useState } from "react"
import type { DriverProfile, TripResponse } from "../../api/types"
import type { Theme } from "../../hooks/useTheme"
import { dateKeyOf, minutesOfDay } from "../../model/format"
import type { IssueFix, TripPlan } from "../../model/tripPlan"
import { LogSheetContainer } from "../LogSheetContainer/LogSheetContainer"
import { RouteMap } from "../RouteMap/RouteMap"
import { SectionNav } from "../layout/SectionNav"
import { TabButton, TabList } from "../layout/TabButton"
import { rise, stagger } from "../ui/motion"
import { ReviewPanel } from "./ReviewPanel"
import { RouteTimeline } from "./RouteTimeline"
import { SummaryCard } from "./SummaryCard"

interface Props {
  trip: TripResponse
  plan: TripPlan
  driver: DriverProfile
  theme: Theme
  onApplyFix: (fix: IssueFix) => void
  onShare: () => void
  busy: boolean
}

type DriverKey = "driver_1" | "co_driver"

/** Results pane. Map, timeline and daily logs describe one trip from
 * three angles and share one selection: hovering or selecting an event in
 * any of them highlights it in the others, and every figure they show
 * comes from the one `plan` object. */
export function TripWorkspace({ trip, plan, driver, theme, onApplyFix, onShare, busy }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [driver1DayIndex, setDriver1DayIndex] = useState(0)
  const [coDriverDayIndex, setCoDriverDayIndex] = useState(0)
  const [activeDriverKey, setActiveDriverKey] = useState<DriverKey>("driver_1")
  const [reviewOpen, setReviewOpen] = useState(false)
  const activeLogIndex = activeDriverKey === "driver_1" ? driver1DayIndex : coDriverDayIndex
  const setActiveLogIndex = activeDriverKey === "driver_1" ? setDriver1DayIndex : setCoDriverDayIndex

  const isTeamTrip = trip.num_drivers === 2 && trip.co_driver_logs != null
  const activeLogs = activeDriverKey === "driver_1" ? trip.logs : (trip.co_driver_logs ?? trip.logs)
  const coDriverProfile: DriverProfile = { ...driver, id: "co_driver", driverName: trip.co_driver_name || "Co-Driver" }
  const activeDriverProfile = activeDriverKey === "driver_1" ? driver : coDriverProfile

  // route.stops leads with the current-location marker, then one marker per
  // stop segment in chronological order.
  const stopSegmentIndices = useMemo(() => {
    const stopSegs = trip.segments.map((s, i) => (s.stop_type ? i : null)).filter((i): i is number => i !== null)
    return [null, ...stopSegs]
  }, [trip.segments])
  // Coordinates per segment: stops get their own marker; a driving or
  // off-duty stretch starts where the previous stop was.
  const stopCoords = useMemo(() => {
    const m = new Map<number, [number, number]>()
    stopSegmentIndices.forEach((segIdx, i) => {
      if (segIdx != null && trip.route.stops[i]) m.set(segIdx, trip.route.stops[i].coords)
    })
    let last: [number, number] = trip.route.current_location_coords
    trip.segments.forEach((_, i) => {
      const own = m.get(i)
      if (own) last = own
      else m.set(i, last)
    })
    return m
  }, [stopSegmentIndices, trip.route.stops, trip.route.current_location_coords, trip.segments])
  const activeIndex = hoverIndex ?? selectedIndex

  const selectSegment = useCallback(
    (segmentIndex: number, scrollTimeline = false) => {
      setSelectedIndex(segmentIndex)
      const seg = trip.segments[segmentIndex]
      const dayIndex = activeLogs.findIndex((log) => log.date === dateKeyOf(seg.start_datetime))
      if (dayIndex >= 0) setActiveLogIndex(dayIndex)
      if (scrollTimeline) {
        document.getElementById(`timeline-seg-${segmentIndex}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" })
      }
    },
    [trip.segments, activeLogs, setActiveLogIndex],
  )

  const activeSeg = activeIndex != null ? trip.segments[activeIndex] : null
  const highlightMinutes = activeSeg && dateKeyOf(activeSeg.start_datetime) === activeLogs[activeLogIndex]?.date ? minutesOfDay(activeSeg.start_datetime) : null

  return (
    <>
      <SectionNav />
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
        <SummaryCard
          plan={plan}
          reviewOpen={reviewOpen}
          onOpenReview={() => setReviewOpen((o) => !o)}
          onShare={onShare}
          onOptimize={plan.shortFinalDay ? () => onApplyFix(plan.issues.find((i) => i.id === "short-final-day")!.fix) : null}
        />
        <ReviewPanel plan={plan} open={reviewOpen} onClose={() => setReviewOpen(false)} onApplyFix={onApplyFix} busy={busy} />

        <motion.div id="section-map" variants={rise} className="grid scroll-mt-28 grid-cols-12 gap-5">
          <div className="col-span-12 min-w-0 xl:col-span-8">
            <RouteMap route={trip.route} days={plan.days} theme={theme} stopSegmentIndices={stopSegmentIndices} activeSegmentIndex={activeIndex} onSelectStop={(i) => selectSegment(i, true)} onHoverStop={setHoverIndex} restartHours={trip.restart_hours} />
          </div>
          <div className="col-span-12 min-w-0 xl:col-span-4">
            <RouteTimeline plan={plan} stopCoords={stopCoords} activeSegmentIndex={activeIndex} onHover={setHoverIndex} onSelect={(i) => selectSegment(i)} />
          </div>
        </motion.div>

        <motion.section id="section-logs" variants={rise} aria-label="Daily logs" className="card scroll-mt-28 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Daily logs</h3>
            {isTeamTrip && (
              <TabList label="Which driver's log to view">
                <TabButton group="drivers" active={activeDriverKey === "driver_1"} onClick={() => setActiveDriverKey("driver_1")}>
                  {driver.driverName}
                </TabButton>
                <TabButton group="drivers" active={activeDriverKey === "co_driver"} onClick={() => setActiveDriverKey("co_driver")}>
                  {trip.co_driver_name || "Co-Driver"}
                </TabButton>
              </TabList>
            )}
          </div>
          <LogSheetContainer
            logs={activeLogs}
            days={plan.days}
            driver={activeDriverProfile}
            trip={trip}
            activeIndex={activeLogIndex}
            onActiveIndexChange={setActiveLogIndex}
            highlightMinutes={highlightMinutes}
            partnerDriverName={activeDriverKey === "driver_1" ? trip.co_driver_name : driver.driverName}
            printSets={
              isTeamTrip && trip.co_driver_logs
                ? [
                    { driver, logs: trip.logs, partnerDriverName: trip.co_driver_name },
                    { driver: coDriverProfile, logs: trip.co_driver_logs, partnerDriverName: driver.driverName },
                  ]
                : undefined
            }
          />
        </motion.section>
      </motion.div>
    </>
  )
}
