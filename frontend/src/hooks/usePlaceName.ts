import { useEffect, useState } from "react"
import { reverseGeocode } from "../api/geocode"

const memory = new Map<string, string | null>()
const STORAGE_KEY = "eld-place-cache"

function keyOf([lng, lat]: [number, number]): string {
  return `${lng.toFixed(3)},${lat.toFixed(3)}`
}

function readCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>
  } catch {
    return {}
  }
}

function writeCache(key: string, label: string) {
  try {
    const cache = readCache()
    cache[key] = label
    const keys = Object.keys(cache)
    if (keys.length > 300) delete cache[keys[0]]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    /* ignore */
  }
}

/** Nearest town for a coordinate, cached in memory and localStorage so a
 * re-render or a re-plan of the same route never re-queries. `null` until
 * known; `undefined` means "no name available". */
export function usePlaceName(coords: [number, number] | null, enabled = true): string | null | undefined {
  const key = coords ? keyOf(coords) : null
  const [name, setName] = useState<string | null | undefined>(() => (key ? (memory.get(key) ?? readCache()[key] ?? null) : undefined))

  useEffect(() => {
    if (!key || !coords || !enabled) return
    const cached = memory.get(key) ?? readCache()[key]
    if (cached !== undefined) {
      setName(cached)
      return
    }
    const controller = new AbortController()
    reverseGeocode(coords, controller.signal).then((label) => {
      if (controller.signal.aborted) return
      memory.set(key, label)
      if (label) writeCache(key, label)
      setName(label ?? undefined)
    })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])

  return name
}
