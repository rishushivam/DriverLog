import { motion } from "framer-motion"
import { useScrollSpy } from "../../hooks/useScrollSpy"
import { spring } from "../ui/motion"

export const RESULT_SECTIONS = [
  { id: "section-summary", label: "Summary" },
  { id: "section-map", label: "Map & Timeline" },
  { id: "section-logs", label: "Daily Logs" },
] as const

/** Sticky segmented tabs over the results: smooth-scroll to a section and
 * highlight whichever one is in view. */
export function SectionNav() {
  const ids = RESULT_SECTIONS.map((s) => s.id)
  const active = useScrollSpy(ids, 140)
  function go(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 112
    window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }
  return (
    <nav aria-label="Results sections" className="sticky top-[var(--header-h)] z-20 -mx-4 mb-4 bg-canvas/85 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 print:hidden">
      <div className="inline-flex gap-1 rounded-xl border border-line bg-surface-2 p-1">
        {RESULT_SECTIONS.map((s) => {
          const isActive = active === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              aria-current={isActive ? "location" : undefined}
              className={`focus-ring relative isolate rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-150 ${isActive ? "font-semibold text-accent-ink dark:text-ink" : "font-medium text-ink-2 hover:text-ink"}`}
            >
              {isActive && <motion.span layoutId="section-nav" transition={spring} className="absolute inset-0 z-0 rounded-lg bg-accent-300 shadow-[0_1px_2px_rgb(0_0_0/0.14)] dark:bg-accent-600/60" aria-hidden="true" />}
              <span className="relative z-10">{s.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
