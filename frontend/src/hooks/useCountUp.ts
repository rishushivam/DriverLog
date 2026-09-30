import { useEffect, useRef, useState } from "react"

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(REDUCED_MOTION_QUERY).matches
}

/** Animates a number from its previous value to `target` with an ease-out
 * curve. Used for the summary strip's figures arriving after a trip is
 * planned — a small, fast (default 600ms) acknowledgment that new data just
 * landed, not a gimmick that runs on every render. */
export function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(0)
  const prevTarget = useRef(0)
  const hasMounted = useRef(false)

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
    }
    if (prefersReducedMotion()) {
      setValue(target)
      prevTarget.current = target
      return
    }

    const start = prevTarget.current
    const delta = target - start
    if (delta === 0) return

    const startTime = performance.now()
    let frame: number

    const tick = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(elapsed / durationMs, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(start + delta * eased)
      if (t < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        prevTarget.current = target
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])

  return value
}
