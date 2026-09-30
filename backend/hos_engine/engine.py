"""Pure Hours-of-Service trip simulator (49 CFR Part 395).

Scope, per the assessment's own stated assumptions: solo driver,
property-carrying, 70-hour/8-day cycle only. No adverse-driving-conditions
exception, no team-driving, no short-haul exceptions.

This module has zero Django/HTTP imports. It consumes already-known leg
distances (miles) and emits a flat, contiguous list of duty-status
`Segment`s for the whole trip. Time math is entirely the engine's own
(distance / AVG_TRUCK_SPEED_MPH) — it never trusts an external routing
API's notion of "duration", so mileage and the simulated clock can never
disagree with each other.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Optional

from . import constants as c
from .types import DRIVING, ON_DUTY_NOT_DRIVING, SLEEPER_BERTH, Segment, TripResult


def _is_close(a: float, b: float, tol: float = c.MILES_EPSILON) -> bool:
    return abs(a - b) <= tol


@dataclass
class _SimState:
    current_time: datetime
    odometer_miles: float
    location_label: str
    cycle_hrs_used: float
    max_cycle_hours: float = c.MAX_CYCLE_HOURS
    restart_hours: float = c.RESTART_DURATION_HOURS
    driving_hrs_in_duty_period: float = 0.0
    driving_hrs_since_break: float = 0.0
    window_hrs_elapsed: float = 0.0
    miles_since_fuel: float = 0.0
    segments: List[Segment] = field(default_factory=list)

    def append_segment(
        self,
        status: str,
        duration_hours: float,
        location_label: str,
        odometer_end_miles: float,
        remark: Optional[str] = None,
        stop_type: Optional[str] = None,
    ) -> None:
        prev_status = self.segments[-1].status if self.segments else None
        start = self.current_time
        end = start + timedelta(hours=duration_hours)
        self.segments.append(
            Segment(
                status=status,
                start_datetime=start,
                end_datetime=end,
                location_label=location_label,
                odometer_start_miles=self.odometer_miles,
                odometer_end_miles=odometer_end_miles,
                remark=remark,
                stop_type=stop_type,
                is_status_change=(status != prev_status),
            )
        )
        self.current_time = end
        self.odometer_miles = odometer_end_miles
        self.location_label = location_label

    def en_route_label(self) -> str:
        if self.odometer_miles <= c.MILES_EPSILON:
            return self.location_label
        return f"En route, mile {round(self.odometer_miles)}"


def _insert_forced_rest(state: _SimState, is_restart: bool, label: str) -> None:
    duration = state.restart_hours if is_restart else c.MIN_OFF_DUTY_RESET_HOURS
    remark = f"{state.restart_hours:g}-hour restart (cycle reset)" if is_restart else "10-hour rest"
    stop_type = "restart" if is_restart else "rest"
    state.append_segment(
        SLEEPER_BERTH, duration, label, state.odometer_miles, remark=remark, stop_type=stop_type
    )
    state.driving_hrs_in_duty_period = 0.0
    state.driving_hrs_since_break = 0.0
    state.window_hrs_elapsed = 0.0
    if is_restart:
        state.cycle_hrs_used = 0.0
    # miles_since_fuel is deliberately NOT reset here — resting doesn't refuel the truck.


def _do_fixed_stop(
    state: _SimState,
    duration_hours: float,
    label: str,
    remark: str,
    is_fuel_stop: bool,
    stop_type: str,
) -> None:
    # An on-duty block can't be partially performed — if it would push cycle
    # hours past the driver's cap (70 for 70/8, 60 for 60/7), a 34-hour
    # restart must happen first, in full.
    if state.cycle_hrs_used + duration_hours > state.max_cycle_hours + c.HOURS_EPSILON:
        _insert_forced_rest(state, is_restart=True, label=label)

    state.append_segment(
        ON_DUTY_NOT_DRIVING, duration_hours, label, state.odometer_miles, remark=remark, stop_type=stop_type
    )
    state.cycle_hrs_used += duration_hours
    state.window_hrs_elapsed += duration_hours
    if duration_hours >= c.MANDATORY_BREAK_DURATION_HOURS - c.HOURS_EPSILON:
        state.driving_hrs_since_break = 0.0
    if is_fuel_stop:
        state.miles_since_fuel = 0.0
    # driving_hrs_in_duty_period is deliberately untouched: on-duty-not-driving
    # work does not refund the 11-hour driving budget, and does not pause or
    # reset the 14-hour window either (window_hrs_elapsed keeps advancing).


def _drive_leg(state: _SimState, leg_distance_miles: float, dest_label: str) -> None:
    if leg_distance_miles <= c.MILES_EPSILON:
        state.location_label = dest_label
        return

    miles_remaining = leg_distance_miles

    while miles_remaining > c.MILES_EPSILON:
        miles_to_break = max(
            (c.DRIVING_HOURS_BEFORE_BREAK - state.driving_hrs_since_break) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )
        miles_to_11hr = max(
            (c.MAX_DRIVING_HOURS_PER_PERIOD - state.driving_hrs_in_duty_period) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )
        miles_to_window = max(
            (c.MAX_ON_DUTY_WINDOW_HOURS - state.window_hrs_elapsed) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )
        miles_to_fuel = max(c.FUEL_INTERVAL_MILES - state.miles_since_fuel, 0.0)
        miles_to_cycle = max(
            (state.max_cycle_hours - state.cycle_hrs_used) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )

        chunk_miles = min(
            miles_to_break, miles_to_11hr, miles_to_window, miles_to_fuel, miles_to_cycle, miles_remaining
        )

        if chunk_miles > c.MILES_EPSILON:
            chunk_hours = chunk_miles / c.AVG_TRUCK_SPEED_MPH
            new_odometer = state.odometer_miles + chunk_miles
            state.append_segment(DRIVING, chunk_hours, state.location_label, new_odometer)
            state.driving_hrs_in_duty_period += chunk_hours
            state.driving_hrs_since_break += chunk_hours
            state.window_hrs_elapsed += chunk_hours
            state.cycle_hrs_used += chunk_hours
            state.miles_since_fuel += chunk_miles
            miles_remaining -= chunk_miles

        if miles_remaining <= c.MILES_EPSILON:
            state.location_label = dest_label
            return

        label = state.en_route_label()

        # Cycle cap wins outright over an ordinary 10-hour reset if both
        # would bind at the same point — a 34-hour restart is a strict
        # superset, so there's never a legal reason to do the smaller one.
        if _is_close(chunk_miles, miles_to_cycle):
            _insert_forced_rest(state, is_restart=True, label=label)
            continue
        if _is_close(chunk_miles, miles_to_window) or _is_close(chunk_miles, miles_to_11hr):
            _insert_forced_rest(state, is_restart=False, label=label)
            continue

        break_due = _is_close(chunk_miles, miles_to_break)
        fuel_due = _is_close(chunk_miles, miles_to_fuel)
        if break_due and fuel_due:
            _do_fixed_stop(
                state,
                max(c.MANDATORY_BREAK_DURATION_HOURS, c.FUEL_STOP_DURATION_HOURS),
                label,
                "Fuel stop (combined with mandatory 30-minute break)",
                is_fuel_stop=True,
                stop_type="fuel",
            )
        elif fuel_due:
            _do_fixed_stop(state, c.FUEL_STOP_DURATION_HOURS, label, "Fuel stop", is_fuel_stop=True, stop_type="fuel")
        else:
            _do_fixed_stop(
                state,
                c.MANDATORY_BREAK_DURATION_HOURS,
                label,
                "Mandatory 30-minute break",
                is_fuel_stop=False,
                stop_type="break",
            )


def simulate_trip(
    leg1_distance_miles: float,
    leg2_distance_miles: float,
    current_cycle_used_hours: float,
    trip_start: datetime,
    current_location_label: str,
    pickup_location_label: str,
    dropoff_location_label: str,
    max_cycle_hours: float = c.MAX_CYCLE_HOURS,
    restart_hours: float = c.RESTART_DURATION_HOURS,
) -> TripResult:
    state = _SimState(
        current_time=trip_start,
        odometer_miles=0.0,
        location_label=current_location_label,
        cycle_hrs_used=current_cycle_used_hours,
        max_cycle_hours=max_cycle_hours,
        restart_hours=restart_hours,
    )

    _drive_leg(state, leg1_distance_miles, pickup_location_label)
    _do_fixed_stop(
        state, c.PICKUP_DURATION_HOURS, pickup_location_label, "Picking up load",
        is_fuel_stop=False, stop_type="pickup",
    )

    _drive_leg(state, leg2_distance_miles, dropoff_location_label)
    _do_fixed_stop(
        state, c.DROPOFF_DURATION_HOURS, dropoff_location_label, "Delivering load",
        is_fuel_stop=False, stop_type="dropoff",
    )

    total_distance = leg1_distance_miles + leg2_distance_miles
    trip_span_hours = (state.segments[-1].end_datetime - state.segments[0].start_datetime).total_seconds() / 3600.0
    return TripResult(
        segments=state.segments,
        total_distance_miles=total_distance,
        total_duration_hours=total_distance / c.AVG_TRUCK_SPEED_MPH,
        total_trip_span_hours=trip_span_hours,
    )
