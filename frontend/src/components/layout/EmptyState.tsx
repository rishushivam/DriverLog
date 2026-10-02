import { motion } from "framer-motion"
import { Button } from "../ui/Button"
import { EASE_OUT } from "../ui/motion"

/** Pre-plan state: a drawn route with its required stops, one line of
 * instruction, and a way to see the tool populated without an API key. */
export function EmptyState({ onLoadExample, onOpenForm }: { onLoadExample: () => void; onOpenForm?: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
      <svg viewBox="0 0 320 140" className="w-[280px] max-w-full" role="img" aria-label="A route with a pickup, a break, a rest and a dropoff">
        <defs>
          <linearGradient id="road" x1="0" x2="1">
            <stop offset="0" stopColor="var(--line-strong)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <motion.path
          d="M16 110 C 70 110, 80 40, 130 48 S 200 110, 240 80 S 290 28, 304 36"
          fill="none"
          stroke="url(#road)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="1 1"
          pathLength={1}
          initial={{ strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 1.2, ease: EASE_OUT }}
        />
        {[
          [16, 110, "var(--ink-2)"],
          [130, 48, "#16a34a"],
          [185, 86, "#7c3aed"],
          [240, 80, "#2563eb"],
          [304, 36, "#dc2626"],
        ].map(([x, y, c], i) => (
          <motion.circle
            key={i}
            cx={x}
            cy={y}
            r="6"
            fill={c as string}
            stroke="var(--surface)"
            strokeWidth="2.5"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ transformOrigin: `${x}px ${y}px` }}
            transition={{ delay: 0.3 + i * 0.18, duration: 0.3, ease: EASE_OUT }}
          />
        ))}
      </svg>
      <h2 className="mt-6 text-base font-semibold text-ink">Enter a route to generate your plan</h2>
      <p className="mt-1 max-w-sm text-sm text-ink-2">Enter where the driver is, where the load is, and where it goes. Required breaks, rests and fuel stops are placed for you.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onOpenForm && (
          <Button variant="primary" onClick={onOpenForm}>
            Enter a route
          </Button>
        )}
        <Button variant="secondary" onClick={onLoadExample}>
          See an example trip
        </Button>
      </div>
    </div>
  )
}
