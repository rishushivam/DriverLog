import { useCallback, useReducer, useRef } from "react"
import { createTrip } from "../api/trips"
import type { ApiError, TripRequest, TripResponse } from "../api/types"

interface State {
  status: "idle" | "submitting" | "success" | "error"
  data: TripResponse | null
  error: ApiError | null
  isSlow: boolean
}

type Action =
  | { type: "SUBMIT" }
  | { type: "SLOW" }
  | { type: "SUCCESS"; data: TripResponse }
  | { type: "ERROR"; error: ApiError }

const initialState: State = { status: "idle", data: null, error: null, isSlow: false }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SUBMIT":
      return { status: "submitting", data: state.data, error: null, isSlow: false }
    case "SLOW":
      return { ...state, isSlow: true }
    case "SUCCESS":
      return { status: "success", data: action.data, error: null, isSlow: false }
    case "ERROR":
      // Keep any previously-successful data visible behind the error banner
      // rather than discarding a working result because a resubmit failed.
      return { status: "error", data: state.data, error: action.error, isSlow: false }
  }
}

const SLOW_REQUEST_THRESHOLD_MS = 13_000

export function useTripPlanner() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const submit = useCallback(async (payload: TripRequest) => {
    dispatch({ type: "SUBMIT" })
    slowTimerRef.current = setTimeout(() => dispatch({ type: "SLOW" }), SLOW_REQUEST_THRESHOLD_MS)
    try {
      const data = await createTrip(payload)
      dispatch({ type: "SUCCESS", data })
    } catch (err) {
      dispatch({ type: "ERROR", error: err as ApiError })
    } finally {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
    }
  }, [])

  return { state, submit }
}
