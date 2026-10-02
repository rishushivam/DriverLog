import { AnimatePresence, motion } from "framer-motion"
import { PanelLeftOpen, X } from "lucide-react"
import { useEffect, type ReactNode } from "react"
import { FORM_SECTIONS, type FormSection } from "../TripForm/TripForm"
import { Tooltip } from "../ui/Tooltip"
import { EASE_OUT } from "../ui/motion"

interface Props {
  /** Desktop: collapsed to a 64px icon rail. */
  collapsed: boolean
  onExpand: () => void
  /** Mobile/tablet: overlay drawer. */
  isDesktop: boolean
  drawerOpen: boolean
  onDrawerChange: (open: boolean) => void
  onJumpToSection: (section: FormSection) => void
  title: ReactNode
  children: ReactNode
}

/** The trip form's container. Desktop: a sticky column that collapses to
 * an icon rail (each icon opens the form at that section). Below 1024px:
 * an overlay drawer with a backdrop, a close button and Escape to close. */
export function Sidebar({ collapsed, onExpand, isDesktop, drawerOpen, onDrawerChange, onJumpToSection, title, children }: Props) {
  useEffect(() => {
    if (isDesktop || !drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDrawerChange(false)
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [isDesktop, drawerOpen, onDrawerChange])

  if (isDesktop) {
    if (collapsed) {
      return (
        <aside aria-label="Trip form (collapsed)" className="sticky top-[var(--header-h)] flex h-[calc(100dvh-var(--header-h))] w-[var(--rail-w)] flex-col items-center gap-2 border-r border-line bg-surface py-3 print:hidden">
          <Tooltip label="Expand trip form ( [ )" side="right">
            <button type="button" onClick={onExpand} aria-label="Expand trip form" aria-expanded={false} className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
              <PanelLeftOpen size={18} aria-hidden="true" />
            </button>
          </Tooltip>
          <span aria-hidden="true" className="my-1 h-px w-8 bg-line" />
          {FORM_SECTIONS.map((s) => (
            <Tooltip key={s.id} label={s.label} side="right">
              <button
                type="button"
                onClick={() => onJumpToSection(s.id)}
                aria-label={`Open ${s.label}`}
                className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <s.icon size={18} aria-hidden="true" />
              </button>
            </Tooltip>
          ))}
        </aside>
      )
    }
    return (
      <aside id="trip-form" aria-label="Trip form" className="sticky top-[var(--header-h)] flex h-[calc(100dvh-var(--header-h))] w-[var(--sidebar-w)] flex-col border-r border-line bg-surface print:hidden">
        <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur">
          {title}
        </div>
        <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4">{children}</div>
      </aside>
    )
  }

  return (
    <>
      <AnimatePresence>
        {drawerOpen && (
          <motion.button
            type="button"
            aria-label="Close trip form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onDrawerChange(false)}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] print:hidden"
          />
        )}
      </AnimatePresence>
      <motion.aside
        role="dialog"
        aria-modal={drawerOpen}
        aria-label="Trip form"
        aria-hidden={!drawerOpen}
        initial={false}
        animate={{ x: drawerOpen ? 0 : "-100%" }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        className="fixed inset-y-0 left-0 z-50 flex w-[min(92vw,420px)] flex-col border-r border-line bg-surface shadow-[var(--shadow-3)] print:hidden"
        style={{ pointerEvents: drawerOpen ? "auto" : "none" }}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          {title}
          <button type="button" onClick={() => onDrawerChange(false)} aria-label="Close trip form" className="focus-ring -mr-1 flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4">{children}</div>
      </motion.aside>
    </>
  )
}
