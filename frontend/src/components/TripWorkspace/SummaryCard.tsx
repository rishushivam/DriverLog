import { motion } from "framer-motion"
import { AlertTriangle, CalendarDays, Clock, Info, Link2, Route as RouteIcon, ShieldCheck, Timer } from "lucide-react"
import type { ReactNode } from "react"
import { useCountUp } from "../../hooks/useCountUp"
import { useUnits } from "../../hooks/useUnits"
import { currentTimezone, formatDateTime, formatSpan, toUnits } from "../../model/format"
import type { TripPlan } from "../../model/tripPlan"
import { Button } from "../ui/Button"
import { SegmentedControl } from "../ui/SegmentedControl"
import { Tooltip } from "../ui/Tooltip"
import { rise } from "../ui/motion"

interface Props {
  plan: TripPlan
  onOpenReview: () => void
  onOptimize: (() => void) | null
  onShare: () => void
  reviewOpen: boolean
}

function Figure({ label, value, tooltip, icon }: { label: string; value: string; tooltip?: ReactNode; icon: ReactNode }) {
  return (
    <div className="min-w-[96px]">
      <dt className="flex items-center gap-1 text-xs font-medium tracking-wide text-ink-3 uppercase">
        <span className="text-ink-3" aria-hidden="true">
          {icon}
        </span>
        {label}
        {tooltip && (
          <Tooltip label={tooltip}>
            <button type="button" aria-label={`What ${label} means`} className="focus-ring -m-0.5 rounded p-0.5 text-ink-3 hover:text-ink">
              <Info size={12} aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </dt>
      <dd className="num mt-0.5 text-lg font-semibold text-ink">{value}</dd>
    </div>
  )
}

/** Every figure here reads from the one computed plan: distance and
 * driving time from the engine, "Total trip" as elapsed wall-clock time,
 * and "Days" as the calendar days the trip touches (one log sheet each). */
export function SummaryCard({ plan, onOpenReview, onOptimize, onShare, reviewOpen }: Props) {
  const { units, setUnits } = useUnits()
  const distance = useCountUp(toUnits(plan.distanceMiles, units))
  const driveHours = useCountUp(plan.driveHours)
  const elapsed = useCountUp(plan.elapsedHours)
  const tz = currentTimezone()
  const warnings = plan.issues.filter((i) => i.severity === "warning").length
  const infos = plan.issues.length - warnings

  return (
    <motion.section id="section-summary" variants={rise} aria-label="Trip summary" className="card scroll-mt-28">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4 px-5 py-4">
        <dl className="flex flex-wrap gap-x-7 gap-y-3">
          <Figure label="Distance" value={`${distance.toFixed(0)} ${units}`} icon={<RouteIcon size={12} />} />
          <Figure label="Drive time" value={`${driveHours.toFixed(1)} h`} icon={<Timer size={12} />} tooltip="Pure driving time at 55 mph. Breaks and rests are not included." />
          <Figure label="Total trip" value={formatSpan(elapsed)} icon={<Clock size={12} />} tooltip="Elapsed time from the first duty segment to the last, including every break, rest and restart." />
          <Figure
            label="Days"
            value={`${plan.calendarDays} ${plan.calendarDays === 1 ? "day" : "days"}`}
            icon={<CalendarDays size={12} />}
            tooltip={`Calendar days the trip touches — one daily log each. A ${formatSpan(plan.elapsedHours)} trip can span ${plan.calendarDays} calendar days.`}
          />
        </dl>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SegmentedControl
            name="units"
            aria-label="Distance units"
            size="sm"
            className="w-[108px]"
            value={units}
            onChange={setUnits}
            options={[
              { value: "mi", label: "mi" },
              { value: "km", label: "km" },
            ]}
          />
          <Button size="sm" variant="secondary" onClick={onShare} leading={<Link2 size={13} aria-hidden="true" />}>
            Share
          </Button>
          <button
            type="button"
            onClick={onOpenReview}
            aria-expanded={reviewOpen}
            aria-controls="review-panel"
            className={`focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              plan.needsReview ? "border-warning/50 bg-warning-soft text-warning-ink hover:border-warning" : "border-success/50 bg-success-soft text-success-ink hover:border-success"
            }`}
          >
            {plan.needsReview ? <AlertTriangle size={14} strokeWidth={2.25} aria-hidden="true" /> : <ShieldCheck size={14} strokeWidth={2.25} aria-hidden="true" />}
            {plan.needsReview ? `Needs review · ${warnings}` : "Compliant"}
            {!plan.needsReview && infos > 0 && <span className="num opacity-80">· {infos} note{infos > 1 ? "s" : ""}</span>}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-5 py-2.5 text-[13px] text-ink-2">
        <p className="num">
          Departs <span className="text-ink">{formatDateTime(plan.startIso)}</span> · arrives <span className="text-ink">{formatDateTime(plan.endIso)}</span>
          <span className="text-ink-3">
            {" "}
            · {tz.short} ({tz.long})
          </span>
        </p>
        {plan.shortFinalDay && onOptimize && (
          <p className="flex items-center gap-2 text-warning-ink">
            <AlertTriangle size={13} aria-hidden="true" />
            Final day has only {plan.shortFinalDay.driveHours.toFixed(1)} h of driving.
            <Button size="sm" variant="ghost" onClick={onOptimize} className="h-7 px-2 text-[13px] text-accent-700 dark:text-accent-300">
              Optimize schedule
            </Button>
          </p>
        )}
      </div>
    </motion.section>
  )
}
