import { Printer } from "lucide-react"
import { useState } from "react"
import type { DailyLog, DriverProfile, TripResponse } from "../../api/types"
import { withViewTransition } from "../../utils/viewTransition"
import { ELDLogSheet } from "../ELDLogSheet/ELDLogSheet"
import { TabButton } from "../layout/TabButton"

interface Props {
  logs: DailyLog[]
  driver: DriverProfile
  trip: TripResponse
  /** Controlled day index + a same-day highlight tick — driven by the
   * workspace's shared timeline/map selection. Uncontrolled (internal
   * state) when omitted, so this component still works stand-alone. */
  activeIndex?: number
  onActiveIndexChange?: (index: number) => void
  highlightMinutes?: number | null
  /** The other name on a team trip, for the screen's currently-active
   * driver — see the same-named prop on `ELDLogSheet` for why this can't
   * be derived from `trip` alone. */
  partnerDriverName?: string
  /** Every driver's complete log set to print — a team trip prints both
   * drivers' full documentation, not just whichever one's tab is open on
   * screen. Defaults to just this one driver/logs for a solo trip. */
  printSets?: Array<{ driver: DriverProfile; logs: DailyLog[]; partnerDriverName?: string }>
}

export function LogSheetContainer({
  logs,
  driver,
  trip,
  activeIndex,
  onActiveIndexChange,
  highlightMinutes,
  partnerDriverName,
  printSets,
}: Props) {
  const [internalIndex, setInternalIndex] = useState(0)
  const index = activeIndex ?? internalIndex
  const setIndex = onActiveIndexChange ?? setInternalIndex

  if (logs.length === 0) return null

  const setsToPrint = printSets ?? [{ driver, logs }]

  return (
    <div>
      {/* Screen-only: day tabs + the currently selected day's sheet. Hidden
          entirely from print — printing renders every day (and, for a team
          trip, every driver) below instead, regardless of which tab
          happens to be open. */}
      <div className="print:hidden">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {logs.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="tablist">
              {logs.map((log, i) => (
                <TabButton key={log.date} active={i === index} onClick={() => withViewTransition(() => setIndex(i))}>
                  Day {i + 1} · {log.date}
                </TabButton>
              ))}
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40"
          >
            <Printer size={13} strokeWidth={2} aria-hidden="true" />
            Print / Save as PDF
          </button>
        </div>
        <ELDLogSheet
          log={logs[index]}
          driver={driver}
          trip={trip}
          allLogs={logs}
          dayIndex={index}
          highlightMinutes={highlightMinutes}
          partnerDriverName={partnerDriverName}
        />
      </div>

      {/* Print-only: every driver's every day, each a complete,
          self-contained page — a multi-day (and/or team) trip's daily logs
          are separate legal documents, not just whichever one the reader
          happened to be looking at. Never rendered/laid out on screen
          (`hidden`), so it costs nothing there. */}
      <div className="hidden print:block">
        {setsToPrint.map(({ driver: setDriver, logs: setLogs, partnerDriverName: setPartnerName }) =>
          setLogs.map((log, i) => (
            <div key={`${setDriver.id}-${log.date}`} className="eld-print-page">
              <ELDLogSheet
                log={log}
                driver={setDriver}
                trip={trip}
                allLogs={setLogs}
                dayIndex={i}
                partnerDriverName={setPartnerName}
              />
            </div>
          )),
        )}
      </div>
    </div>
  )
}
