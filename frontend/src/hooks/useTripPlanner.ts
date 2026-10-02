import { useCallback, useEffect, useReducer, useRef } from "react"
import { createTrip } from "../api/trips"
import type { ApiError, TripRequest, TripResponse } from "../api/types"
import exampleTrip from "../mock/exampleTrip.json"

interface State {
  status: "idle" | "submitting" | "success" | "error"
  data: TripResponse | null
  error: ApiError | null
  isSlow: boolean
  /** True for a moment after a successful plan, for the button's check. */
  justSucceeded: boolean
}

type Action =
  | { type: "SUBMIT" }
  | { type: "SLOW" }
  | { type: "SUCCESS"; data: TripResponse }
  | { type: "ERROR"; error: ApiError }
  | { type: "SETTLE" }

const initialState: State = { status: "idle", data: null, error: null, isSlow: false, justSucceeded: false }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SUBMIT":
      return { ...state, status: "submitting", error: null, isSlow: false, justSucceeded: false }
    case "SLOW":
      return { ...state, isSlow: true }
    case "SUCCESS":
      return { status: "success", data: action.data, error: null, isSlow: false, justSucceeded: true }
    case "ERROR":
      return { ...state, status: "error", error: action.error, isSlow: false, justSucceeded: false }
    case "SETTLE":
      return { ...state, justSucceeded: false }
  }
}

const SLOW_REQUEST_THRESHOLD_MS = 13_000

export function useTripPlanner() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!state.justSucceeded) return
    const id = setTimeout(() => dispatch({ type: "SETTLE" }), 1800)
    return () => clearTimeout(id)
  }, [state.justSucceeded])

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

  /** A bundled trip produced by the real engine (see src/mock), so the
   * results pane can be seen without a routing API key. */
  const loadExample = useCallback(() => {
    dispatch({ type: "SUCCESS", data: exampleTrip as unknown as TripResponse })
  }, [])

  return { state, submit, loadExample }
}
