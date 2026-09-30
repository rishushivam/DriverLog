import { apiPost, HttpError } from "./client"
import type { ApiError, TripRequest, TripResponse } from "./types"

export async function createTrip(payload: TripRequest): Promise<TripResponse> {
  try {
    return await apiPost<TripResponse>("/api/trips/", payload)
  } catch (err) {
    throw normalizeError(err)
  }
}

function normalizeError(err: unknown): ApiError {
  if (err instanceof HttpError) {
    if (err.status === 400 && err.body && typeof err.body === "object") {
      return {
        kind: "validation",
        message: "Please fix the highlighted fields.",
        fieldErrors: err.body as Record<string, string[]>,
      }
    }
    if (err.status === 422 && err.body && typeof err.body === "object" && "error" in (err.body as object)) {
      return { kind: "unprocessable", message: String((err.body as { error: unknown }).error) }
    }
    return { kind: "server", message: "Something went wrong on our end. Please try again." }
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return { kind: "network", message: "The request timed out. Please try again — the server may just be waking up." }
  }
  return { kind: "network", message: "Couldn't reach the server. Check your connection and try again." }
}
