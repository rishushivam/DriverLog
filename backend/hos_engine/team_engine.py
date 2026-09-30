"""Two-driver ("team") trip simulation — the real regulatory mechanism, not
a label. Per the FMCSA guide's own team-driving example: one driver drives
while the other rests in the sleeper berth, then they swap, letting the
TRUCK move far longer per day than either driver's individual 11-hour limit
while each driver's own 11-hr/14-hr/cycle clocks stay fully independent and
fully compliant.

Each driver keeps their own personal segment list — exactly like a real
team keeps two separate RODS logs, never one merged sheet. A driver's
personal log shows DRIVING while they're behind the wheel and SLEEPER_BERTH
while their partner drives, with their own odometer frozen during that
time (they didn't personally drive those miles, so those miles aren't
"theirs" on their own daily total).

The truck-level `segments` list (used for the map/stops, same as the solo
engine) is a single canonical timeline of what physically happened to the
vehicle, independent of which driver was behind the wheel at any moment.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from . import constants as c
from .types import DRIVING, ON_DUTY_NOT_DRIVING, SLEEPER_BERTH, Segment, TripResult


def _is_close(a: float, b: float, tol: float = c.MILES_EPSILON) -> bool:
    return abs(a - b) <= tol


@dataclass
class _TruckState:
    current_time: datetime
    odometer_miles: float
    location_label: str
    miles_since_fuel: float = 0.0
    segments: List[Segment] = field(default_factory=list)

    def append_segment(self, status, duration_hours, location_label, odometer_end_miles, remark=None, stop_type=None):
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


@dataclass
class _DriverClock:
    driver_id: str
    cycle_hrs_used: float
    max_cycle_hours: float
    restart_hours: float = c.RESTART_DURATION_HOURS
    personal_odometer: float = 0.0
    driving_hrs_in_duty_period: float = 0.0
    driving_hrs_since_break: float = 0.0
    window_hrs_elapsed: float = 0.0
    # Both start "fully rested" at trip start — neither has been driving,
    # so both are immediately eligible.
    rest_hrs_since_last_drive: float = c.MIN_OFF_DUTY_RESET_HOURS
    # Hit their own cycle cap; ineligible to drive until 34 hours off,
    # whether taken explicitly or accumulated "for free" while resting.
    is_capped: bool = False
    segments: List[Segment] = field(default_factory=list)

    def append(self, status, start, end, location_label, odometer_end_miles=None, remark=None, stop_type=None):
        prev_status = self.segments[-1].status if self.segments else None
        odo_end = self.personal_odometer if odometer_end_miles is None else odometer_end_miles
        self.segments.append(
            Segment(
                status=status,
                start_datetime=start,
                end_datetime=end,
                location_label=location_label,
                odometer_start_miles=self.personal_odometer,
                odometer_end_miles=odo_end,
                remark=remark,
                stop_type=stop_type,
                is_status_change=(status != prev_status),
                driver=self.driver_id,
            )
        )
        self.personal_odometer = odo_end

    def reset_duty_period(self):
        self.driving_hrs_in_duty_period = 0.0
        self.driving_hrs_since_break = 0.0
        self.window_hrs_elapsed = 0.0


def _maybe_recover_from_cap(driver: _DriverClock) -> None:
    """A capped driver recovers the instant their own accumulated rest
    reaches 34 hours — whether that happened via an explicit shared
    restart or just from sitting in the resting role long enough while
    their partner kept driving."""
    if driver.is_capped and driver.rest_hrs_since_last_drive >= driver.restart_hours - c.HOURS_EPSILON:
        driver.is_capped = False
        driver.cycle_hrs_used = 0.0


def _shared_wait(truck: _TruckState, active: _DriverClock, resting: _DriverClock, duration_hours: float, label: str) -> None:
    """The truck idles while the resting partner finishes their required
    rest before it's safe to legally swap — the active driver, having
    already used their own legal budget, waits too. Rare in practice: a
    driving stint bound by the 11-hour cap is normally >= 10 hours, which
    already satisfies the partner's own rest requirement by symmetry."""
    remark = "Waiting for co-driver's required rest"
    start = truck.current_time
    end = start + timedelta(hours=duration_hours)
    truck.append_segment(SLEEPER_BERTH, duration_hours, label, truck.odometer_miles, remark=remark, stop_type="rest")
    active.append(SLEEPER_BERTH, start, end, label, remark=remark, stop_type="rest")
    resting.append(SLEEPER_BERTH, start, end, label, remark=remark, stop_type="rest")
    resting.rest_hrs_since_last_drive += duration_hours
    _maybe_recover_from_cap(resting)


def _insert_solo_style_reset(
    truck: _TruckState, active: _DriverClock, resting: _DriverClock, label: str, is_restart: bool
) -> None:
    """The partner is unavailable (already capped, waiting on their own
    34-hour recovery) or both drivers are capped at once — the truck falls
    back to ordinary solo behavior: active takes their own reset/restart,
    no role swap. If both were capped, this one shared stop clears both."""
    duration = active.restart_hours if is_restart else c.MIN_OFF_DUTY_RESET_HOURS
    remark = f"{active.restart_hours:g}-hour restart (cycle reset)" if is_restart else "10-hour rest"
    stop_type = "restart" if is_restart else "rest"
    start = truck.current_time
    end = start + timedelta(hours=duration)

    truck.append_segment(SLEEPER_BERTH, duration, label, truck.odometer_miles, remark=remark, stop_type=stop_type)
    active.append(SLEEPER_BERTH, start, end, label, remark=remark, stop_type=stop_type)
    resting.append(SLEEPER_BERTH, start, end, label, remark=remark, stop_type=stop_type)

    active.reset_duty_period()
    if is_restart:
        active.cycle_hrs_used = 0.0
    resting.rest_hrs_since_last_drive += duration
    _maybe_recover_from_cap(resting)


def _resolve_ordinary_handoff(
    truck: _TruckState, active: _DriverClock, resting: _DriverClock, label: str
) -> Tuple[_DriverClock, _DriverClock]:
    """Active hit their own 11-hour driving or 14-hour window limit —
    an ordinary end-of-shift, not a cycle exhaustion."""
    if resting.is_capped:
        _insert_solo_style_reset(truck, active, resting, label, is_restart=False)
        return active, resting

    if resting.rest_hrs_since_last_drive < c.MIN_OFF_DUTY_RESET_HOURS - c.HOURS_EPSILON:
        _shared_wait(truck, active, resting, c.MIN_OFF_DUTY_RESET_HOURS - resting.rest_hrs_since_last_drive, label)

    active.reset_duty_period()
    active.rest_hrs_since_last_drive = 0.0
    resting.reset_duty_period()
    return resting, active


def _resolve_capped_handoff(
    truck: _TruckState, active: _DriverClock, resting: _DriverClock, label: str
) -> Tuple[_DriverClock, _DriverClock]:
    """Active hit their own cycle cap (70 or 60 hours) — they're done
    until a real 34 hours off, whether taken explicitly or accrued while
    resting. If the partner has cycle room, hand off to them so the truck
    keeps moving; the newly-capped driver just starts their recovery clock
    in the resting role."""
    if resting.is_capped:
        _insert_solo_style_reset(truck, active, resting, label, is_restart=True)
        return active, resting

    if resting.rest_hrs_since_last_drive < c.MIN_OFF_DUTY_RESET_HOURS - c.HOURS_EPSILON:
        _shared_wait(truck, active, resting, c.MIN_OFF_DUTY_RESET_HOURS - resting.rest_hrs_since_last_drive, label)

    resting.reset_duty_period()
    active.rest_hrs_since_last_drive = 0.0
    return resting, active


def _drive_leg_team(
    truck: _TruckState, active: _DriverClock, resting: _DriverClock, leg_distance_miles: float, dest_label: str
) -> Tuple[_DriverClock, _DriverClock]:
    if leg_distance_miles <= c.MILES_EPSILON:
        truck.location_label = dest_label
        return active, resting

    miles_remaining = leg_distance_miles

    while miles_remaining > c.MILES_EPSILON:
        miles_to_break = max(
            (c.DRIVING_HOURS_BEFORE_BREAK - active.driving_hrs_since_break) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )
        miles_to_11hr = max(
            (c.MAX_DRIVING_HOURS_PER_PERIOD - active.driving_hrs_in_duty_period) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )
        miles_to_window = max(
            (c.MAX_ON_DUTY_WINDOW_HOURS - active.window_hrs_elapsed) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )
        miles_to_fuel = max(c.FUEL_INTERVAL_MILES - truck.miles_since_fuel, 0.0)
        miles_to_cycle = max((active.max_cycle_hours - active.cycle_hrs_used) * c.AVG_TRUCK_SPEED_MPH, 0.0)

        chunk_miles = min(
            miles_to_break, miles_to_11hr, miles_to_window, miles_to_fuel, miles_to_cycle, miles_remaining
        )

        if chunk_miles > c.MILES_EPSILON:
            chunk_hours = chunk_miles / c.AVG_TRUCK_SPEED_MPH
            start = truck.current_time
            end = start + timedelta(hours=chunk_hours)
            new_truck_odo = truck.odometer_miles + chunk_miles

            truck.append_segment(DRIVING, chunk_hours, truck.location_label, new_truck_odo)
            active.append(DRIVING, start, end, truck.location_label, active.personal_odometer + chunk_miles)
            resting.append(SLEEPER_BERTH, start, end, truck.location_label)  # odometer frozen — not their miles

            active.driving_hrs_in_duty_period += chunk_hours
            active.driving_hrs_since_break += chunk_hours
            active.window_hrs_elapsed += chunk_hours
            active.cycle_hrs_used += chunk_hours
            resting.rest_hrs_since_last_drive += chunk_hours
            _maybe_recover_from_cap(resting)
            truck.miles_since_fuel += chunk_miles
            miles_remaining -= chunk_miles

        if miles_remaining <= c.MILES_EPSILON:
            truck.location_label = dest_label
            return active, resting

        label = truck.en_route_label()

        if _is_close(chunk_miles, miles_to_cycle):
            active.is_capped = True
            active, resting = _resolve_capped_handoff(truck, active, resting, label)
            continue
        if _is_close(chunk_miles, miles_to_window) or _is_close(chunk_miles, miles_to_11hr):
            active, resting = _resolve_ordinary_handoff(truck, active, resting, label)
            continue

        break_due = _is_close(chunk_miles, miles_to_break)
        fuel_due = _is_close(chunk_miles, miles_to_fuel)
        duration, remark, is_fuel_stop, stop_type = None, None, False, None
        if break_due and fuel_due:
            duration = max(c.MANDATORY_BREAK_DURATION_HOURS, c.FUEL_STOP_DURATION_HOURS)
            remark, is_fuel_stop, stop_type = "Fuel stop (combined with mandatory 30-minute break)", True, "fuel"
        elif fuel_due:
            duration, remark, is_fuel_stop, stop_type = c.FUEL_STOP_DURATION_HOURS, "Fuel stop", True, "fuel"
        else:
            duration, remark, is_fuel_stop, stop_type = c.MANDATORY_BREAK_DURATION_HOURS, "Mandatory 30-minute break", False, "break"

        # Active driver's on-duty block can't be partially performed — cap
        # check before committing to it, same principle as the solo engine.
        if active.cycle_hrs_used + duration > active.max_cycle_hours + c.HOURS_EPSILON:
            active.is_capped = True
            active, resting = _resolve_capped_handoff(truck, active, resting, label)

        start = truck.current_time
        end = start + timedelta(hours=duration)
        truck.append_segment(ON_DUTY_NOT_DRIVING, duration, label, truck.odometer_miles, remark=remark, stop_type=stop_type)
        active.append(ON_DUTY_NOT_DRIVING, start, end, label, remark=remark, stop_type=stop_type)
        resting.append(SLEEPER_BERTH, start, end, label)

        active.cycle_hrs_used += duration
        active.window_hrs_elapsed += duration
        if duration >= c.MANDATORY_BREAK_DURATION_HOURS - c.HOURS_EPSILON:
            active.driving_hrs_since_break = 0.0
        if is_fuel_stop:
            truck.miles_since_fuel = 0.0
        resting.rest_hrs_since_last_drive += duration
        _maybe_recover_from_cap(resting)

    return active, resting


def simulate_team_trip(
    leg1_distance_miles: float,
    leg2_distance_miles: float,
    current_cycle_used_hours: float,
    trip_start: datetime,
    current_location_label: str,
    pickup_location_label: str,
    dropoff_location_label: str,
    max_cycle_hours: float = c.MAX_CYCLE_HOURS,
    restart_hours: float = c.RESTART_DURATION_HOURS,
) -> Tuple[TripResult, List[Segment], List[Segment]]:
    """Returns (truck-level TripResult for map/stops, driver_1's personal
    segments, driver_2's personal segments). Both drivers start with the
    same `current_cycle_used_hours` — this app has one shared cycle-hours
    input, not a separate one per driver, documented as a simplification.
    Driver 1 always starts active at trip start."""
    truck = _TruckState(current_time=trip_start, odometer_miles=0.0, location_label=current_location_label)
    driver_1 = _DriverClock(
        driver_id="driver_1", cycle_hrs_used=current_cycle_used_hours, max_cycle_hours=max_cycle_hours,
        restart_hours=restart_hours,
    )
    driver_2 = _DriverClock(
        driver_id="driver_2", cycle_hrs_used=current_cycle_used_hours, max_cycle_hours=max_cycle_hours,
        restart_hours=restart_hours,
    )
    active, resting = driver_1, driver_2

    active, resting = _drive_leg_team(truck, active, resting, leg1_distance_miles, pickup_location_label)

    # Pickup: same cap-check-then-append pattern as a break/fuel stop, but
    # fixed to PICKUP_DURATION_HOURS/DROPOFF_DURATION_HOURS and always
    # performed by whoever is currently active.
    for duration, label, remark, stop_type in (
        (c.PICKUP_DURATION_HOURS, pickup_location_label, "Picking up load", "pickup"),
    ):
        if active.cycle_hrs_used + duration > active.max_cycle_hours + c.HOURS_EPSILON:
            active.is_capped = True
            active, resting = _resolve_capped_handoff(truck, active, resting, label)
        start = truck.current_time
        end = start + timedelta(hours=duration)
        truck.append_segment(ON_DUTY_NOT_DRIVING, duration, label, truck.odometer_miles, remark=remark, stop_type=stop_type)
        active.append(ON_DUTY_NOT_DRIVING, start, end, label, remark=remark, stop_type=stop_type)
        resting.append(SLEEPER_BERTH, start, end, label)
        active.cycle_hrs_used += duration
        active.window_hrs_elapsed += duration
        active.driving_hrs_since_break = 0.0
        resting.rest_hrs_since_last_drive += duration
        _maybe_recover_from_cap(resting)

    active, resting = _drive_leg_team(truck, active, resting, leg2_distance_miles, dropoff_location_label)

    for duration, label, remark, stop_type in (
        (c.DROPOFF_DURATION_HOURS, dropoff_location_label, "Delivering load", "dropoff"),
    ):
        if active.cycle_hrs_used + duration > active.max_cycle_hours + c.HOURS_EPSILON:
            active.is_capped = True
            active, resting = _resolve_capped_handoff(truck, active, resting, label)
        start = truck.current_time
        end = start + timedelta(hours=duration)
        truck.append_segment(ON_DUTY_NOT_DRIVING, duration, label, truck.odometer_miles, remark=remark, stop_type=stop_type)
        active.append(ON_DUTY_NOT_DRIVING, start, end, label, remark=remark, stop_type=stop_type)
        resting.append(SLEEPER_BERTH, start, end, label)
        active.cycle_hrs_used += duration
        active.window_hrs_elapsed += duration
        resting.rest_hrs_since_last_drive += duration
        _maybe_recover_from_cap(resting)

    total_distance = leg1_distance_miles + leg2_distance_miles
    trip_span_hours = (truck.segments[-1].end_datetime - truck.segments[0].start_datetime).total_seconds() / 3600.0
    truck_result = TripResult(
        segments=truck.segments,
        total_distance_miles=total_distance,
        total_duration_hours=total_distance / c.AVG_TRUCK_SPEED_MPH,
        total_trip_span_hours=trip_span_hours,
    )
    # driver_1/driver_2 here are the _DriverClock objects captured by
    # reference throughout — re-fetch by id since `active`/`resting` may
    # have swapped roles by the end.
    ordered = {"driver_1": driver_1, "driver_2": driver_2}
    return truck_result, ordered["driver_1"].segments, ordered["driver_2"].segments
