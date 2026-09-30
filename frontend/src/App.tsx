import { useEffect, useState } from "react"
import { pingHealth } from "./api/client"
import { useTripPlanner } from "./hooks/useTripPlanner"
import { TripForm } from "./components/TripForm/TripForm"
import { SummaryStrip } from "./components/layout/SummaryStrip"
import { TripWorkspace } from "./components/TripWorkspace/TripWorkspace"
import { LoadingPanel } from "./components/layout/LoadingPanel"
import { ErrorBanner } from "./components/layout/ErrorBanner"
import { EmptyState } from "./components/layout/EmptyState"
import { RuledDivider } from "./components/layout/RuledDivider"
import { DEFAULT_DRIVER_ID, getDriverProfile } from "./config/drivers"

function App() {
  const { state, submit } = useTripPlanner()
  const [driverId, setDriverId] = useState(DEFAULT_DRIVER_ID)

  useEffect(() => {
    pingHealth()
  }, [])

  const isSubmitting = state.status === "submitting"
  const trip = state.data

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative overflow-hidden bg-navy-600 print:hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.08),transparent_60%)]"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight text-white">ELD Trip Planner</h1>
          <p className="text-sm text-navy-50/80">Plan a driver's trip and generate FMCSA-compliant daily logs.</p>
        </div>
        <RuledDivider tone="onDark" />
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 print:m-0 print:max-w-none print:space-y-0 print:p-0 sm:px-6">
        <section id="trip-details" className="rounded-md border border-slate-300 bg-white p-5 shadow-sm print:hidden">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trip details</h2>
          <TripForm
            onSubmit={submit}
            isSubmitting={isSubmitting}
            error={state.error}
            driverId={driverId}
            onDriverChange={setDriverId}
          />
        </section>

        {state.error && (
          <div className="print:hidden">
            <ErrorBanner error={state.error} />
          </div>
        )}

        {isSubmitting && !trip && (
          <div className="print:hidden">
            <LoadingPanel isSlow={state.isSlow} />
          </div>
        )}

        {!isSubmitting && !trip && !state.error && (
          <div className="print:hidden">
            <EmptyState />
          </div>
        )}

        {trip && (
          <section key={trip.id} className="space-y-4 print:space-y-0">
            <div className="animate-reveal print:hidden">
              <SummaryStrip trip={trip} />
            </div>
            <div className="animate-reveal" style={{ animationDelay: "70ms" }}>
              <TripWorkspace trip={trip} driver={getDriverProfile(driverId)} />
            </div>
          </section>
        )}
      </main>

      <footer className="mt-10 print:hidden">
        <RuledDivider />
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-slate-500 sm:px-6">
          <span>ELD Trip Planner — Part 395 hours-of-service compliance</span>
          <span className="tabular-nums text-slate-400">70-hour / 8-day cycle</span>
        </div>
      </footer>
    </div>
  )
}

export default App
