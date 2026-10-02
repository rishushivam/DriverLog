import { PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Truck } from "lucide-react"
import type { ThemePreference } from "../../hooks/useTheme"
import { ThemeToggle } from "../ui/ThemeToggle"
import { Tooltip } from "../ui/Tooltip"

interface Props {
  isDesktop: boolean
  collapsed: boolean
  onToggleSidebar: () => void
  onOpenDrawer: () => void
  preference: ThemePreference
  onThemeChange: (p: ThemePreference) => void
  cycleLabel?: string
}

export function Header({ isDesktop, collapsed, onToggleSidebar, onOpenDrawer, preference, onThemeChange, cycleLabel }: Props) {
  return (
    <header className="sticky top-0 z-30 h-[var(--header-h)] border-b border-line bg-canvas/85 backdrop-blur print:hidden">
      <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          {isDesktop ? (
            <Tooltip label={`${collapsed ? "Expand" : "Collapse"} sidebar ( [ )`} side="bottom">
              <button type="button" onClick={onToggleSidebar} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="trip-form" aria-keyshortcuts="[" className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
                {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
              </button>
            </Tooltip>
          ) : (
            <button type="button" onClick={onOpenDrawer} aria-label="Open trip form" className="focus-ring flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-medium text-ink-2 hover:text-ink">
              <SlidersHorizontal size={15} aria-hidden="true" />
              Trip
            </button>
          )}
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink shadow-[0_1px_2px_rgb(0_0_0/0.2)]" aria-hidden="true">
            <Truck size={16} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink">ELD Trip Planner</h1>
            <p className="hidden text-xs text-ink-3 sm:block">Part 395 hours-of-service planning</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cycleLabel && <span className="num hidden text-xs text-ink-3 md:block">{cycleLabel} cycle</span>}
          <div className="w-[108px] sm:w-[220px]">
            <ThemeToggle preference={preference} onChange={onThemeChange} compact={typeof window !== "undefined" && window.innerWidth < 640} />
          </div>
        </div>
      </div>
    </header>
  )
}
