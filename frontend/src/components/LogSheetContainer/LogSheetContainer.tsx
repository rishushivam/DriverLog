import { AnimatePresence, motion } from "framer-motion"
import { Check, Copy, Printer } from "lucide-react"
import { useState } from "react"
import type { DailyLog, DriverProfile, TripResponse } from "../../api/types"
import { ELDLogSheet } from "../ELDLogSheet/ELDLogSheet"
import { TabButton, TabList } from "../layout/TabButton"
import { press, quick } from "../ui/motion"

interface Props {
  logs: DailyLog[]
  driver: DriverProfile
  trip: TripResponse
  activeIndex?: number
  onActiveIndexChange?: (index: number) => void
  highlightMinutes?: number | null
  partnerDriverName?: string
  printSets?: Array<{ driver: DriverProfile; logs: DailyLog[]; partnerDriverName?: string }>
}

/** Plain-text rendition of one day's log for the clipboard: the same
 * figures an inspector reads off the sheet, in the same order. */
function logToText(log: DailyLog, driver: DriverProfile): string {
  const lines = [
    `Driver's Daily Log — ${log.date} — ${driver.driverName} (${driver.carrierName})`,
    `Truck ${driver.truckTractorNumber} / Trailer ${driver.trailerNumbers}`,
    `Total miles driving today: ${log.total_miles}`,
    "",
    ...log.segments.map((s) => `${s.start_time}–${s.end_time}  ${s.status.replace(/_/g, " ").padEnd(20)}  ${s.location_label}${s.remark ? ` — ${s.remark}` : ""}`),
    "",
    `Totals: Off duty ${log.totals.OFF_DUTY.toFixed(2)}  Sleeper ${log.totals.SLEEPER_BERTH.toFixed(2)}  Driving ${log.totals.DRIVING.toFixed(2)}  On duty ${log.totals.ON_DUTY_NOT_DRIVING.toFixed(2)}`,
    `Cycle hours used at end of day: ${log.cycle_hours_used_end_of_day.toFixed(2)}`,
  ]
  return lines.join("\n")
}

export function LogSheetContainer({ logs, driver, trip, activeIndex, onActiveIndexChange, highlightMinutes, partnerDriverName, printSets }: Props) {
  const [internalIndex, setInternalIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const index = Math.min(activeIndex ?? internalIndex, logs.length - 1)
  const setIndex = onActiveIndexChange ?? setInternalIndex
  if (logs.length === 0) return null
  const setsToPrint = printSets ?? [{ driver, logs }]
  const log = logs[index]

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(logToText(log, driver))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable: nothing to recover */
    }
  }

  function onTabKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") setIndex((index + 1) % logs.length)
    if (e.key === "ArrowLeft") setIndex((index - 1 + logs.length) % logs.length)
  }

  return (
    <div>
      <div className="print:hidden">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2" onKeyDown={onTabKey}>
          <TabList label="Log day">
            {logs.map((l, i) => (
              <TabButton key={l.date} group="log-days" active={i === index} onClick={() => setIndex(i)} id={`log-tab-${i}`} controls="log-panel">
                Day {i + 1}
                <span className={`num ml-1.5 ${i === index ? "text-accent-ink/70 dark:text-ink-2" : "text-ink-3"}`}>{l.date.slice(5)}</span>
              </TabButton>
            ))}
          </TabList>
          <div className="flex gap-2">
            <motion.button
              type="button"
              whileTap={press}
              onClick={copyLog}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span key="ok" initial={{ scale: 0.7 }} animate={{ scale: 1 }} exit={{ opacity: 0 }} transition={quick} className="text-emerald-600 dark:text-emerald-400">
                    <Check size={13} strokeWidth={2.5} />
                  </motion.span>
                ) : (
                  <motion.span key="copy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}>
                    <Copy size={13} strokeWidth={2} />
                  </motion.span>
                )}
              </AnimatePresence>
              {copied ? "Copied" : "Copy"}
            </motion.button>
            <motion.button
              type="button"
              whileTap={press}
              onClick={() => window.print()}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <Printer size={13} strokeWidth={2} aria-hidden="true" />
              Export PDF
            </motion.button>
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={log.date}
            id="log-panel"
            role="tabpanel"
            aria-labelledby={`log-tab-${index}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={quick}
          >
            <ELDLogSheet log={log} driver={driver} trip={trip} allLogs={logs} dayIndex={index} highlightMinutes={highlightMinutes} partnerDriverName={partnerDriverName} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="hidden print:block">
        {setsToPrint.map(({ driver: setDriver, logs: setLogs, partnerDriverName: setPartnerName }) =>
          setLogs.map((l, i) => (
            <div key={`${setDriver.id}-${l.date}`} className="eld-print-page">
              <ELDLogSheet log={l} driver={setDriver} trip={trip} allLogs={setLogs} dayIndex={i} partnerDriverName={setPartnerName} />
            </div>
          )),
        )}
      </div>
    </div>
  )
}
