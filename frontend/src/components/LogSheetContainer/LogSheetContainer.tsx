import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Palette, Printer } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { DailyLog, DriverProfile, TripResponse } from "../../api/types"
import { useLocalStorage } from "../../hooks/useLocalStorage"
import { formatDayLabel } from "../../model/format"
import type { PlanDay } from "../../model/tripPlan"
import { ELDLogSheet, type SheetFields } from "../ELDLogSheet/ELDLogSheet"
import { TabButton, TabList } from "../layout/TabButton"
import { Button } from "../ui/Button"
import { useToast } from "../ui/Toast"
import { Tooltip } from "../ui/Tooltip"
import { quick } from "../ui/motion"

interface Props {
  logs: DailyLog[]
  days: PlanDay[]
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
function logToText(log: DailyLog, driver: DriverProfile, fields: SheetFields): string {
  const lines = [
    `Driver's Daily Log — ${formatDayLabel(log.date, true)} — ${driver.driverName} (${driver.carrierName})`,
    `Truck ${driver.truckTractorNumber} / Trailer ${driver.trailerNumbers}`,
    `Total miles driving today: ${log.total_miles}`,
    fields.shipping_documents ? `Shipping documents: ${fields.shipping_documents}` : "",
    fields.manifest_no ? `DVL/manifest no.: ${fields.manifest_no}` : "",
    fields.shipper_commodity ? `Shipper & commodity: ${fields.shipper_commodity}` : "",
    "",
    ...log.segments.map((s) => `${s.start_time}–${s.end_time}  ${s.status.replace(/_/g, " ").padEnd(20)}  ${s.location_label}${s.remark ? ` — ${s.remark}` : ""}`),
    "",
    `Totals: Off duty ${log.totals.OFF_DUTY.toFixed(2)}  Sleeper ${log.totals.SLEEPER_BERTH.toFixed(2)}  Driving ${log.totals.DRIVING.toFixed(2)}  On duty ${log.totals.ON_DUTY_NOT_DRIVING.toFixed(2)}  = 24.00`,
    `Cycle hours used at end of day: ${log.cycle_hours_used_end_of_day.toFixed(2)}`,
  ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
  return lines.join("\n")
}

const EMPTY_FIELDS: SheetFields = { shipping_documents: "", manifest_no: "", shipper_commodity: "" }

export function LogSheetContainer({ logs, days, driver, trip, activeIndex, onActiveIndexChange, highlightMinutes, partnerDriverName, printSets }: Props) {
  const { toast } = useToast()
  const [internalIndex, setInternalIndex] = useState(0)
  const [matchTheme, setMatchTheme] = useLocalStorage<boolean>("eld-log-match-theme", false)
  const [fieldsByDate, setFieldsByDate] = useState<Record<string, SheetFields>>({})
  const [printing, setPrinting] = useState(false)
  const index = Math.min(activeIndex ?? internalIndex, logs.length - 1)
  const setIndex = onActiveIndexChange ?? setInternalIndex
  const log = logs[index]
  const fieldsFor = useCallback((date: string) => fieldsByDate[date] ?? EMPTY_FIELDS, [fieldsByDate])

  useEffect(() => {
    const done = () => setPrinting(false)
    window.addEventListener("afterprint", done)
    return () => window.removeEventListener("afterprint", done)
  }, [])

  if (logs.length === 0 || !log) return null
  const setsToPrint = printSets ?? [{ driver, logs }]

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(logToText(log, driver, fieldsFor(log.date)))
      toast("success", "Copied as text", `Day ${index + 1} log is on your clipboard.`)
    } catch {
      toast("error", "Couldn't copy", "Your browser blocked clipboard access.")
    }
  }

  /** One action: the browser's print dialog is also the PDF export
   * (Save as PDF). Print CSS renders one page per day. */
  function print() {
    setPrinting(true)
    const pages = setsToPrint.reduce((n, s) => n + s.logs.length, 0)
    toast("info", "Opening the print dialog", `${pages} page${pages === 1 ? "" : "s"}, one per day. Choose "Save as PDF" as the destination to export.`)
    setTimeout(() => {
      window.print()
      setTimeout(() => setPrinting(false), 1500)
    }, 150)
  }

  function onTabKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") setIndex((index + 1) % logs.length)
    if (e.key === "ArrowLeft") setIndex((index - 1 + logs.length) % logs.length)
    if (e.key === "Home") setIndex(0)
    if (e.key === "End") setIndex(logs.length - 1)
  }

  return (
    <div>
      <div className="print:hidden">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1" onKeyDown={onTabKey}>
            <Tooltip label="Previous day">
              <button type="button" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous day" className="btn btn-secondary focus-ring h-8 w-8 rounded-lg disabled:opacity-40">
                <ChevronLeft size={15} aria-hidden="true" />
              </button>
            </Tooltip>
            <TabList label="Log day">
              {logs.map((l, i) => {
                const day = days.find((d) => d.date === l.date)
                const warn = day?.status === "warning"
                return (
                  <TabButton key={l.date} group="log-days" active={i === index} onClick={() => setIndex(i)} id={`log-tab-${i}`} controls="log-panel">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${warn ? "bg-warning" : "bg-success"}`} aria-hidden="true" />
                      Day {i + 1}
                      <span className="sr-only">{warn ? ", needs attention" : ", OK"}</span>
                      <span className={`num ${i === index ? "text-accent-ink/70 dark:text-ink-2" : "text-ink-3"}`}>{formatDayLabel(l.date).replace(/^\w+,\s/, "")}</span>
                      <span className={`num ${i === index ? "text-accent-ink/70 dark:text-ink-2" : "text-ink-3"}`}>· {l.totals.DRIVING.toFixed(1)} h</span>
                      {warn && <AlertTriangle size={11} className="text-warning" aria-hidden="true" />}
                    </span>
                  </TabButton>
                )
              })}
            </TabList>
            <Tooltip label="Next day">
              <button type="button" onClick={() => setIndex(Math.min(logs.length - 1, index + 1))} disabled={index === logs.length - 1} aria-label="Next day" className="btn btn-secondary focus-ring h-8 w-8 rounded-lg disabled:opacity-40">
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={matchTheme ? "primary" : "secondary"} onClick={() => setMatchTheme(!matchTheme)} aria-pressed={matchTheme} leading={<Palette size={13} aria-hidden="true" />}>
              Match theme
            </Button>
            <Button size="sm" variant="secondary" onClick={copyLog} leading={<Copy size={13} aria-hidden="true" />}>
              Copy as text
            </Button>
            <Button size="sm" variant="secondary" onClick={print} loading={printing} leading={<Printer size={13} aria-hidden="true" />}>
              Print / Save as PDF
            </Button>
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={log.date} id="log-panel" role="tabpanel" aria-labelledby={`log-tab-${index}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={quick}>
            <div className="rounded-xl bg-surface-3/60 p-2 sm:p-4">
              <ELDLogSheet
                log={log}
                driver={driver}
                trip={trip}
                allLogs={logs}
                dayIndex={index}
                highlightMinutes={highlightMinutes}
                partnerDriverName={partnerDriverName}
                matchTheme={matchTheme}
                fields={fieldsFor(log.date)}
                onFieldChange={(key, value) => setFieldsByDate((f) => ({ ...f, [log.date]: { ...fieldsFor(log.date), [key]: value } }))}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="hidden print:block">
        {setsToPrint.map(({ driver: setDriver, logs: setLogs, partnerDriverName: setPartnerName }) =>
          setLogs.map((l, i) => (
            <div key={`${setDriver.id}-${l.date}`} className="eld-print-page">
              <ELDLogSheet log={l} driver={setDriver} trip={trip} allLogs={setLogs} dayIndex={i} partnerDriverName={setPartnerName} matchTheme={false} fields={fieldsFor(l.date)} />
            </div>
          )),
        )}
      </div>
    </div>
  )
}
