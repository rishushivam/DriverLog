import { flushSync } from "react-dom"

/** Runs a state update inside the View Transitions API when the browser
 * supports it, so tab switches (Route Map <-> Daily Logs, day-to-day within
 * the logs) cross-fade as one continuous surface instead of an instant swap.
 * Falls back to a plain update everywhere else — this is progressive
 * enhancement, not a requirement. */
export function withViewTransition(update: () => void): void {
  if (typeof document.startViewTransition !== "function") {
    update()
    return
  }
  document.startViewTransition(() => {
    flushSync(update)
  })
}
