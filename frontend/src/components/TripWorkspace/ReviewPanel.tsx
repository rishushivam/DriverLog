import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Info, ShieldCheck, Wrench, X } from "lucide-react"
import type { IssueFix, TripPlan } from "../../model/tripPlan"
import { Button } from "../ui/Button"
import { quick } from "../ui/motion"

interface Props {
  plan: TripPlan
  open: boolean
  onClose: () => void
  onApplyFix: (fix: IssueFix) => void
  busy: boolean
}

/** "Needs review", made actionable: each issue is listed with what it
 * means and, where the planner can do something about it, a one-click fix
 * that re-plans with the adjusted request. */
export function ReviewPanel({ plan, open, onClose, onApplyFix, busy }: Props) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.section
          id="review-panel"
          aria-label="Review items"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={quick}
          className="overflow-hidden"
        >
          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                {plan.needsReview ? <AlertTriangle size={15} className="text-warning" aria-hidden="true" /> : <ShieldCheck size={15} className="text-success" aria-hidden="true" />}
                {plan.needsReview ? "Review before dispatch" : "Nothing to review"}
              </h3>
              <button type="button" onClick={onClose} aria-label="Close review panel" className="focus-ring -mr-1 rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {plan.issues.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-2">No restart, no cycle wait, and a fresh clock at departure. The plan stays within Part 395.</p>
            ) : (
              <ul className="divide-y divide-line">
                {plan.issues.map((issue) => {
                  const warning = issue.severity === "warning"
                  return (
                    <li key={issue.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${warning ? "bg-warning-soft text-warning" : "bg-info-soft text-info"}`} aria-hidden="true">
                        {warning ? <AlertTriangle size={13} /> : <Info size={13} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">
                          <span className="sr-only">{warning ? "Warning: " : "Note: "}</span>
                          {issue.title}
                        </p>
                        <p className="mt-0.5 text-[13px] text-ink-2">{issue.detail}</p>
                      </div>
                      {issue.fix.kind !== "none" && (
                        <Button size="sm" variant="secondary" onClick={() => onApplyFix(issue.fix)} disabled={busy} leading={<Wrench size={13} aria-hidden="true" />}>
                          {issue.fix.label}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="border-t border-line px-5 py-2.5 text-xs text-ink-3">The plan itself never breaks a rule. Review items are things a dispatcher should know before sending it.</p>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
