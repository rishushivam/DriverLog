import { useCallback } from "react"
import type { TripRequest } from "../api/types"
import { useLocalStorage } from "./useLocalStorage"

export interface RecentTrip {
  id: string
  label: string
  savedAt: string
  request: TripRequest
}

const MAX = 8

export function useRecentTrips() {
  const [trips, setTrips] = useLocalStorage<RecentTrip[]>("eld-recent-trips", [])

  const remember = useCallback(
    (request: TripRequest) => {
      const label = `${request.current_location} → ${request.dropoff_location}`
      setTrips((prev) => {
        const dedup = prev.filter((t) => t.label !== label)
        return [{ id: `${Date.now()}`, label, savedAt: new Date().toISOString(), request }, ...dedup].slice(0, MAX)
      })
    },
    [setTrips],
  )

  const remove = useCallback((id: string) => setTrips((prev) => prev.filter((t) => t.id !== id)), [setTrips])
  const clear = useCallback(() => setTrips([]), [setTrips])

  return { trips, remember, remove, clear }
}

/** Shareable link: the request JSON, base64url-encoded in the hash. */
export function encodeShareLink(request: TripRequest): string {
  const json = JSON.stringify(request)
  const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  const url = new URL(window.location.href)
  url.hash = `trip=${b64}`
  return url.toString()
}

export function decodeShareLink(hash: string): TripRequest | null {
  const m = /trip=([A-Za-z0-9_-]+)/.exec(hash)
  if (!m) return null
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/")
    const json = decodeURIComponent(escape(atob(b64)))
    const parsed = JSON.parse(json) as TripRequest
    if (!parsed.current_location || !parsed.pickup_location || !parsed.dropoff_location) return null
    return parsed
  } catch {
    return null
  }
}
