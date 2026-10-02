import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { pingHealth } from "./api/client"
import type { TripRequest } from "./api/types"
import { Header } from "./components/layout/Header"
import { EmptyState } from "./components/layout/EmptyState"
import { ErrorBanner } from "./components/layout/ErrorBanner"
import { Sidebar } from "./components/layout/Sidebar"
import { TripForm, type FormSection, type TripFormHandle } from "./components/TripForm/TripForm"
import { TripWorkspace } from "./components/TripWorkspace/TripWorkspace"
import { ResultsSkeleton } from "./components/ui/Skeleton"
import { ToastProvider, useToast } from "./components/ui/Toast"
import { quick } from "./components/ui/motion"
import { DEFAULT_DRIVER_ID, getDriverProfile } from "./config/drivers"
import { useIsDesktop } from "./hooks/useMediaQuery"
import { decodeShareLink, encodeShareLink, useRecentTrips } from "./hooks/useRecentTrips"
import { useSidebar } from "./hooks/useSidebar"
import { useTheme } from "./hooks/useTheme"
import { useTripPlanner } from "./hooks/useTripPlanner"
import { defaultUnits, UnitsContext } from "./hooks/useUnits"
import { useLocalStorage } from "./hooks/useLocalStorage"
import type { Units } from "./model/format"
import { applyIssueFix, buildTripPlan, type IssueFix } from "./model/tripPlan"

function Planner() {
  const { toast } = useToast()
  const recent = useRecentTrips()
  const { state, submit, retry, reset, loadExample } = useTripPlanner((_, request) => {
    recent.remember(request)
    toast("success", "Trip planned", `${request.current_location} → ${request.dropoff_location}`)
  })
  const [driverId, setDriverId] = useState(DEFAULT_DRIVER_ID)
  const { preference, theme, setPreference } = useTheme()
  const isDesktop = useIsDesktop()
  const { collapsed, setCollapsed, toggle } = useSidebar()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [units, setUnits] = useLocalStorage<Units>("eld-units", defaultUnits())
  const formRef = useRef<TripFormHandle>(null)
  const unitsApi = useMemo(() => ({ units, setUnits }), [units, setUnits])

  useEffect(() => {
    pingHealth()
  }, [])

  const isSubmitting = state.status === "submitting"
  const trip = state.data
  const plan = useMemo(() => (trip ? buildTripPlan(trip) : null), [trip])

  useEffect(() => {
    if (state.status === "error" && state.error) toast("error", "Couldn't plan the trip", state.error.message)
  }, [state.status, state.error, toast])

  // Shared link: prefill the form and plan it on first load.
  const sharedHandled = useRef(false)
  useEffect(() => {
    if (sharedHandled.current) return
    sharedHandled.current = true
    const shared = decodeShareLink(window.location.hash)
    if (!shared) return
    formRef.current?.load(shared)
    submit(shared)
    history.replaceState(null, "", window.location.pathname + window.location.search)
  }, [submit])

  // On mobile, planning closes the drawer so the results take the screen.
  useEffect(() => {
    if (!isDesktop && (isSubmitting || state.status === "success")) setDrawerOpen(false)
  }, [isDesktop, isSubmitting, state.status])

  const handleSubmit = useCallback((payload: TripRequest) => submit(payload), [submit])
  const handleLoadExample = useCallback(() => {
    loadExample()
    setDrawerOpen(false)
  }, [loadExample])
  const openForm = useCallback(() => {
    if (isDesktop) {
      setCollapsed(false)
      requestAnimationFrame(() => document.getElementById("trip-form")?.querySelector<HTMLElement>("input,select,button")?.focus())
    } else setDrawerOpen(true)
  }, [isDesktop, setCollapsed])
  const jumpToSection = useCallback(
    (section: FormSection) => {
      setCollapsed(false)
      setTimeout(() => formRef.current?.openSection(section), 60)
    },
    [setCollapsed],
  )
  const applyFix = useCallback(
    (fix: IssueFix) => {
      if (!state.request) return
      const next = applyIssueFix(state.request, fix)
      formRef.current?.load(next)
      submit(next)
      toast("info", "Re-planning with the fix applied")
    },
    [state.request, submit, toast],
  )
  const share = useCallback(async () => {
    if (!state.request) return
    const link = encodeShareLink(state.request)
    try {
      await navigator.clipboard.writeText(link)
      toast("success", "Link copied", "Anyone with the link gets this trip's inputs and a fresh plan.")
    } catch {
      toast("error", "Couldn't copy the link", link)
    }
  }, [state.request, toast])

  const form = (
    <TripForm
      handle={formRef}
      onSubmit={handleSubmit}
      onReset={reset}
      isSubmitting={isSubmitting}
      justSucceeded={state.justSucceeded}
      error={state.error}
      driverId={driverId}
      onDriverChange={setDriverId}
      onLoadExample={trip ? undefined : handleLoadExample}
      plan={plan}
      recentTrips={recent.trips}
      onRemoveRecent={recent.remove}
    />
  )

  const results = (
    <>
      {state.error && (
        <div className="mb-5 print:hidden">
          <ErrorBanner error={state.error} onEdit={openForm} onRetry={retry} />
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {isSubmitting ? (
          <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick} className="print:hidden">
            <ResultsSkeleton slow={state.isSlow} />
          </motion.div>
        ) : trip && plan ? (
          <motion.div key={`trip-${trip.id}-${trip.created_at}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}>
            <TripWorkspace trip={trip} plan={plan} driver={getDriverProfile(driverId)} theme={theme} onApplyFix={applyFix} onShare={share} busy={isSubmitting} />
          </motion.div>
        ) : (
          !state.error && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick} className="print:hidden">
              <EmptyState onLoadExample={handleLoadExample} onOpenForm={!isDesktop || collapsed ? openForm : undefined} />
            </motion.div>
          )
        )}
      </AnimatePresence>
    </>
  )

  const sidebarTitle = (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-ink">Trip details</p>
      <p className="truncate text-xs text-ink-3">{trip ? `${trip.current_location} → ${trip.dropoff_location}` : "Fill in the route to plan"}</p>
    </div>
  )

  return (
    <UnitsContext.Provider value={unitsApi}>
      <div className="min-h-dvh bg-canvas text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
          Skip to results
        </a>
        <Header isDesktop={isDesktop} collapsed={collapsed} onToggleSidebar={toggle} onOpenDrawer={() => setDrawerOpen(true)} preference={preference} onThemeChange={setPreference} cycleLabel={plan?.cycle.schedule} />
        <div className="flex print:block">
          <Sidebar collapsed={collapsed} onExpand={() => setCollapsed(false)} isDesktop={isDesktop} drawerOpen={drawerOpen} onDrawerChange={setDrawerOpen} onJumpToSection={jumpToSection} title={sidebarTitle}>
            {form}
          </Sidebar>
          <main id="main" className="min-w-0 flex-1 px-4 pt-4 pb-10 sm:px-6 sm:pt-5 print:p-0">
            {results}
          </main>
        </div>
      </div>
    </UnitsContext.Provider>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Planner />
    </ToastProvider>
  )
}
