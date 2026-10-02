import { motion } from "framer-motion"
import { useMemo, useState } from "react"
import type { DriverProfile, TripResponse } from "../../api/types"
import type { Theme } from "../../hooks/useTheme"
import { deriveOperationalStops, segmentDateKey, segmentMinutesOfDay } from "../../utils/tripSegments"
import { LogSheetContainer } from "../LogSheetContainer/LogSheetContainer"
import { RouteMap } from "../RouteMap/RouteMap"
import { SummaryStrip } from "../layout/SummaryStrip"
import { TabButton, TabList } from "../layout/TabButton"
import { rise, stagger } from "../ui/motion"
import { RouteTimeline } from "./RouteTimeline"

interface Props {
  trip: TripResponse
  driver: DriverProfile
  theme: Theme
}

type DriverKey = "driver_1" | "co_driver"

/** Results pane. Map, timeline and daily logs describe one trip from
 * three angles and share one selection: hovering or selecting an event in
 * any of them highlights it in the others. */
export function TripWorkspace({ trip, driver, theme }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [driver1DayIndex, setDriver1DayIndex] = useState(0)
  const [coDriverDayIndex, setCoDriverDayIndex] = useState(0)
  const [activeDriverKey, setActiveDriverKey] = useState<DriverKey>("driver_1")
  const activeLogIndex = activeDriverKey === "driver_1" ? driver1DayIndex : coDriverDayIndex
  const setActiveLogIndex = activeDriverKey === "driver_1" ? setDriver1DayIndex : setCoDriverDayIndex

  const isTeamTrip = trip.num_drivers === 2 && trip.co_driver_logs != null
  const activeLogs = activeDriverKey === "driver_1" ? trip.logs : (trip.co_driver_logs ?? trip.logs)
  const coDriverProfile: DriverProfile = { ...driver, id: "co_driver", driverName: trip.co_driver_name || "Co-Driver" }
  const activeDriverProfile = activeDriverKey === "driver_1" ? driver : coDriverProfile

  const operationalStops = useMemo(() => deriveOperationalStops(trip), [trip])
  const stopSegmentIndices = useMemo(() => [null, ...operationalStops.map((s) => s.segmentIndex)], [operationalStops])
  const activeIndex = hoverIndex ?? selectedIndex

  function selectSegment(segmentIndex: number) {
    setSelectedIndex(segmentIndex)
    const seg = trip.segments[segmentIndex]
    const dayIndex = activeLogs.findIndex((log) => log.date === segmentDateKey(seg.start_datetime))
    if (dayIndex >= 0) setActiveLogIndex(dayIndex)
  }

  // The hovered (or selected) event flashes a marker on the log grid when
  // it falls on the day being shown.
  const activeSeg = activeIndex != null ? trip.segments[activeIndex] : null
  const highlightMinutes =
    activeSeg && segmentDateKey(activeSeg.start_datetime) === activeLogs[activeLogIndex]?.date ? segmentMinutesOfDay(activeSeg.start_datetime) : null

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <SummaryStrip trip={trip} />

      <motion.div variants={rise} className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="min-w-0">
          <RouteMap
            route={trip.route}
            theme={theme}
            height="h-[320px] xl:h-[560px]"
            stopSegmentIndices={stopSegmentIndices}
            activeSegmentIndex={activeIndex}
            onSelectStop={selectSegment}
            onHoverStop={setHoverIndex}
            restartHours={trip.restart_hours}
          />
        </div>
        <RouteTimeline trip={trip} activeSegmentIndex={activeIndex} onHover={setHoverIndex} onSelect={selectSegment} />
      </motion.div>

      <motion.section variants={rise} aria-label="Daily logs" className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
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
  )
}
