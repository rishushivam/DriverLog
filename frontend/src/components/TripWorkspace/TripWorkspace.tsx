import { useMemo, useState } from "react"
import type { DriverProfile, TripResponse } from "../../api/types"
import { LogSheetContainer } from "../LogSheetContainer/LogSheetContainer"
import { RouteMap } from "../RouteMap/RouteMap"
import { TabButton } from "../layout/TabButton"
import { TripStops } from "./TripStops"
import { TripTimeline } from "./TripTimeline"
import { deriveOperationalStops, segmentDateKey, segmentMinutesOfDay } from "../../utils/tripSegments"

interface Props {
  trip: TripResponse
  driver: DriverProfile
}

type DriverKey = "driver_1" | "co_driver"

/** Map, operational stops, timeline, and the daily ELD logs used to live
 * behind an unrelated Route-Map/Daily-Logs tab switch. They describe the
 * same trip from four angles, so they now render as one connected flow —
 * hovering or selecting an event in one place highlights it everywhere
 * else it appears, via one shared `segmentIndex` selection. */
export function TripWorkspace({ trip, driver }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [activeLogIndex, setActiveLogIndex] = useState(0)
  const [activeDriverKey, setActiveDriverKey] = useState<DriverKey>("driver_1")

  const isTeamTrip = trip.num_drivers === 2 && trip.co_driver_logs != null
  const activeLogs = activeDriverKey === "driver_1" ? trip.logs : (trip.co_driver_logs ?? trip.logs)
  // Team driving never merges two people's hours onto one sheet — the
  // co-driver gets their own profile (same truck/carrier, different name)
  // rather than driver 1's identity stamped on their log.
  const coDriverProfile: DriverProfile = { ...driver, id: "co_driver", driverName: trip.co_driver_name || "Co-Driver" }
  const activeDriverProfile: DriverProfile = activeDriverKey === "driver_1" ? driver : coDriverProfile

  const operationalStops = useMemo(() => deriveOperationalStops(trip), [trip])
  const stopSegmentIndices = useMemo(
    () => [null, ...operationalStops.map((s) => s.segmentIndex)],
    [operationalStops],
  )

  const activeIndex = hoverIndex ?? selectedIndex

  function selectSegment(segmentIndex: number) {
    setSelectedIndex(segmentIndex)
    const seg = trip.segments[segmentIndex]
    const dayIndex = activeLogs.findIndex((log) => log.date === segmentDateKey(seg.start_datetime))
    if (dayIndex >= 0) setActiveLogIndex(dayIndex)
  }

  function selectDriver(key: DriverKey) {
    setActiveDriverKey(key)
    setActiveLogIndex(0)
  }

  const selectedSeg = selectedIndex != null ? trip.segments[selectedIndex] : null
  const highlightMinutes =
    selectedSeg && segmentDateKey(selectedSeg.start_datetime) === activeLogs[activeLogIndex]?.date
      ? segmentMinutesOfDay(selectedSeg.start_datetime)
      : null

  return (
    <div className="grid grid-cols-1 gap-6 print:block lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-5 print:hidden">
        <RouteMap
          route={trip.route}
          height="h-[320px] lg:h-[420px]"
          stopSegmentIndices={stopSegmentIndices}
          activeSegmentIndex={activeIndex}
          onSelectStop={selectSegment}
          restartHours={trip.restart_hours}
        />
        <TripStops
          stops={operationalStops}
          activeSegmentIndex={activeIndex}
          onSelect={selectSegment}
          cycleSchedule={trip.cycle_schedule}
          cycleCapHours={trip.cycle_cap_hours}
          cycleCapDays={trip.cycle_cap_days}
          restartHours={trip.restart_hours}
        />
      </div>

      <div className="print:hidden">
        <TripTimeline
          segments={trip.segments}
          activeSegmentIndex={activeIndex}
          onHover={setHoverIndex}
          onSelect={selectSegment}
          restartHours={trip.restart_hours}
        />
      </div>

      <div className="lg:col-span-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Daily ELD logs</h3>
          {isTeamTrip && (
            <div className="flex gap-2" role="tablist" aria-label="Which driver's log to view">
              <TabButton active={activeDriverKey === "driver_1"} onClick={() => selectDriver("driver_1")}>
                {driver.driverName}
              </TabButton>
              <TabButton active={activeDriverKey === "co_driver"} onClick={() => selectDriver("co_driver")}>
                {trip.co_driver_name || "Co-Driver"}
              </TabButton>
            </div>
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
      </div>
    </div>
  )
}
