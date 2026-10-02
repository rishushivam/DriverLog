import { API_BASE_URL } from "./client"
import type { LocationSuggestion } from "./types"

/** Never throws — autocomplete is a nice-to-have. A failed or aborted
 * request just means no suggestions this keystroke, not an error state. */
export async function suggestLocations(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/geocode-suggest/?q=${encodeURIComponent(query)}`, { signal })
    if (!res.ok) return []
    return (await res.json()) as LocationSuggestion[]
  } catch {
    return []
  }
}

/** Nearest town for an engine-placed stop. Null on any failure. */
export async function reverseGeocode([lng, lat]: [number, number], signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/geocode-reverse/?lng=${lng.toFixed(4)}&lat=${lat.toFixed(4)}`, { signal })
    if (!res.ok) return null
    const body = (await res.json()) as { label: string | null }
    return body.label ?? null
  } catch {
    return null
  }
}
