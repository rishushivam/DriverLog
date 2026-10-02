import { ChevronDown } from "lucide-react"
import { useId, type ReactNode } from "react"
import { Reveal } from "./Reveal"

interface Props {
  title: string
  icon?: ReactNode
  /** One-line recap shown when collapsed. */
  summary?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
  id?: string
  badge?: ReactNode
}

/** Form section with a disclosure header. Collapsed, the header shows a
 * summary of what's inside so nothing is hidden without a trace. */
export function Collapsible({ title, icon, summary, open, onToggle, children, id, badge }: Props) {
  const uid = useId()
  const panelId = `${uid}-panel`
  return (
    <section id={id} className="rounded-xl border border-line bg-surface">
      <h3 className="m-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="focus-ring flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-2"
        >
          {icon && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-3 text-ink-2">{icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              {title}
              {badge}
            </span>
            {!open && summary && <span className="num mt-0.5 block truncate text-[13px] text-ink-3">{summary}</span>}
          </span>
          <ChevronDown size={16} className={`shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </h3>
      <Reveal open={open} id={panelId}>
        <div className="px-4 pb-4">{children}</div>
      </Reveal>
    </section>
  )
}
