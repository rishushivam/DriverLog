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
