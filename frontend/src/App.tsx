import { AnimatePresence, motion } from "framer-motion"
import { Truck } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { pingHealth } from "./api/client"
import { ErrorBanner } from "./components/layout/ErrorBanner"
import { EmptyState } from "./components/layout/EmptyState"
import { BottomSheet } from "./components/layout/BottomSheet"
import { TripForm } from "./components/TripForm/TripForm"
import { TripWorkspace } from "./components/TripWorkspace/TripWorkspace"
import { ResultsSkeleton } from "./components/ui/Skeleton"
import { ThemeToggle } from "./components/ui/ThemeToggle"
import { quick } from "./components/ui/motion"
import { DEFAULT_DRIVER_ID, getDriverProfile } from "./config/drivers"
import { scheduleLabel } from "./config/stopTypes"
import { useTheme } from "./hooks/useTheme"
import { useTripPlanner } from "./hooks/useTripPlanner"

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const onChange = () => setDesktop(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return desktop
}

export default function App() {
  const { state, submit, loadExample } = useTripPlanner()
  const [driverId, setDriverId] = useState(DEFAULT_DRIVER_ID)
  const [theme, toggleTheme] = useTheme()
  const isDesktop = useIsDesktop()
  const [sheetOpen, setSheetOpen] = useState(true)

  useEffect(() => {
    pingHealth()
  }, [])

  const isSubmitting = state.status === "submitting"
  const trip = state.data

  // On mobile, planning collapses the sheet so the results take the screen.
  useEffect(() => {
    if (!isDesktop && (isSubmitting || state.status === "success")) setSheetOpen(false)
  }, [isDesktop, isSubmitting, state.status])

  const handleSubmit = useCallback(
    (payload: Parameters<typeof submit>[0]) => {
      submit(payload)
    },
    [submit],
  )
  const handleLoadExample = useCallback(() => {
    loadExample()
    if (!isDesktop) setSheetOpen(false)
  }, [loadExample, isDesktop])

  const form = (
    <TripForm
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      justSucceeded={state.justSucceeded}
      error={state.error}
      driverId={driverId}
      onDriverChange={setDriverId}
      onLoadExample={trip ? undefined : handleLoadExample}
    />
  )

  const results = (
    <>
      {state.error && (
        <div className="mb-6 print:hidden">
          <ErrorBanner error={state.error} onEdit={() => (isDesktop ? document.getElementById("trip-form")?.scrollIntoView({ behavior: "smooth" }) : setSheetOpen(true))} />
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {isSubmitting ? (
          <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick} className="print:hidden">
            <ResultsSkeleton />
          </motion.div>
        ) : trip ? (
          <motion.div key={`trip-${trip.id}-${trip.created_at}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}>
            <TripWorkspace trip={trip} driver={getDriverProfile(driverId)} theme={theme} />
          </motion.div>
        ) : (
          !state.error && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick} className="print:hidden">
              <EmptyState onLoadExample={handleLoadExample} />
            </motion.div>
          )
        )}
      </AnimatePresence>
    </>
  )

  const summaryLine = trip ? `${trip.current_location} → ${trip.dropoff_location}` : "Plan a trip"

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur print:hidden">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink shadow-[0_1px_2px_rgb(0_0_0/0.2)]" aria-hidden="true">
              <Truck size={16} strokeWidth={2.5} />
            </span>
            <div className="leading-tight">
              <h1 className="text-[15px] font-semibold tracking-tight text-ink">ELD Trip Planner</h1>
              <p className="hidden text-xs text-ink-3 sm:block">Part 395 hours-of-service planning</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {trip && (
              <span className="num hidden text-xs text-ink-3 md:block">{scheduleLabel(trip.cycle_schedule, trip.cycle_cap_hours, trip.cycle_cap_days)} cycle</span>
            )}
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>
      </header>

      {isDesktop ? (
        <div className="grid grid-cols-[380px_minmax(0,1fr)] print:block">
          <aside id="trip-form" className="scroll-thin sticky top-14 h-[calc(100dvh-3.5rem)] overflow-y-auto border-r border-line bg-surface px-5 py-6 print:hidden">
            {form}
          </aside>
          <main className="min-w-0 px-6 py-6 print:p-0">{results}</main>
        </div>
      ) : (
        <>
          <main className="px-4 pt-5 pb-28 print:p-0">{results}</main>
          <div className="print:hidden">
            <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen} summary={summaryLine}>
              {form}
            </BottomSheet>
          </div>
        </>
      )}
    </div>
  )
}
