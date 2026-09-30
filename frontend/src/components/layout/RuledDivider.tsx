import { useEffect, useRef } from "react"

interface Props {
  tone?: "default" | "onDark"
}

/** A thin ruled line with tick marks — the same hour-axis motif from the log
 * sheet, reused as the app's recurring section-divider signature rather than
 * a plain border. Draws itself in on first mount, the same "a line resolves"
 * idea as the log sheet's duty path and the route map's polyline, so the
 * header doesn't just appear inert before there's any trip data to show. */
export function RuledDivider({ tone = "default" }: Props) {
  const colorClass = tone === "onDark" ? "text-navy-200/60" : "text-slate-300"
  const lineRef = useRef<SVGLineElement>(null)

  useEffect(() => {
    const line = lineRef.current
    if (!line) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const length = line.getTotalLength()
    line.style.transition = "none"
    line.style.strokeDasharray = `${length}`
    line.style.strokeDashoffset = `${length}`
    line.getBoundingClientRect()
    line.style.transition = "stroke-dashoffset 900ms cubic-bezier(0.16, 1, 0.3, 1)"
    line.style.strokeDashoffset = "0"
  }, [])

  return (
    <svg viewBox="0 0 1000 12" preserveAspectRatio="none" className={`h-3 w-full ${colorClass}`} aria-hidden="true">
      <line ref={lineRef} x1={0} y1={6} x2={1000} y2={6} stroke="currentColor" strokeWidth={1} />
      {Array.from({ length: 26 }, (_, i) => i * 40).map((x) => (
        <line key={x} x1={x} y1={2} x2={x} y2={10} stroke="currentColor" strokeWidth={1} />
      ))}
    </svg>
  )
}
