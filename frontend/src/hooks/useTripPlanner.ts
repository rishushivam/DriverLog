import { useCallback, useEffect, useReducer, useRef } from "react"
import { createTrip } from "../api/trips"
import type { ApiError, TripRequest, TripResponse } from "../api/types"
import exampleTrip from "../mock/exampleTrip.json"

interface State {
  status: "idle" | "submitting" | "success" | "error"
  data: TripResponse | null
  /** The request that produced `data` (or failed) — kept so "retry",
   * "share" and issue fixes can re-run or derive from it. */
  request: TripRequest | null
  error: ApiError | null
  isSlow: boolean
  /** True for a moment after a successful plan, for the button's check. */
  justSucceeded: boolean
}

type Action =
  | { type: "SUBMIT"; request: TripRequest }
  | { type: "SLOW" }
  | { type: "SUCCESS"; data: TripResponse; request: TripRequest | null }
  | { type: "ERROR"; error: ApiError }
  | { type: "SETTLE" }
  | { type: "RESET" }

const initialState: State = { status: "idle", data: null, request: null, error: null, isSlow: false, justSucceeded: false }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SUBMIT":
      return { ...state, status: "submitting", request: action.request, error: null, isSlow: false, justSucceeded: false }
    case "SLOW":
      return { ...state, isSlow: true }
    case "SUCCESS":
      return { status: "success", data: action.data, request: action.request, error: null, isSlow: false, justSucceeded: true }
    case "ERROR":
      return { ...state, status: "error", error: action.error, isSlow: false, justSucceeded: false }
    case "SETTLE":
      return { ...state, justSucceeded: false }
    case "RESET":
      return initialState
  }
}

const SLOW_REQUEST_THRESHOLD_MS = 13_000

export function useTripPlanner(onSuccess?: (data: TripResponse, request: TripRequest) => void) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  useEffect(() => {
    if (!state.justSucceeded) return
    const id = setTimeout(() => dispatch({ type: "SETTLE" }), 1800)
    return () => clearTimeout(id)
  }, [state.justSucceeded])

  const submit = useCallback(async (payload: TripRequest) => {
    dispatch({ type: "SUBMIT", request: payload })
    slowTimerRef.current = setTimeout(() => dispatch({ type: "SLOW" }), SLOW_REQUEST_THRESHOLD_MS)
    try {
      const data = await createTrip(payload)
      dispatch({ type: "SUCCESS", data, request: payload })
      onSuccessRef.current?.(data, payload)
    } catch (err) {
      dispatch({ type: "ERROR", error: err as ApiError })
    } finally {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
    }
  }, [])

  const retry = useCallback(() => {
    if (state.request) submit(state.request)
  }, [state.request, submit])

  const reset = useCallback(() => dispatch({ type: "RESET" }), [])

  /** A bundled trip produced by the real engine (see src/mock), so the
   * results pane can be seen without a routing API key. */
  const loadExample = useCallback(() => {
    const data = exampleTrip as unknown as TripResponse
    dispatch({
      type: "SUCCESS",
      data,
      request: {
        current_location: data.current_location,
        pickup_location: data.pickup_location,
        dropoff_location: data.dropoff_location,
        current_cycle_used_hours: data.current_cycle_used_hours,
        cycle_schedule: data.cycle_schedule,
        num_drivers: data.num_drivers,
        co_driver_name: data.co_driver_name,
        restart_hours: data.restart_hours,
        driving_hours_today: data.driving_hours_today,
        on_duty_hours_today: data.on_duty_hours_today,
        client_local_time: data.segments[0]?.start_datetime.slice(0, 19) ?? "",
      },
    })
  }, [])

  return { state, submit, retry, reset, loadExample }
}
