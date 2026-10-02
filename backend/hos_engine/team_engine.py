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

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

from . import constants as c
from .rules import HosRules
from .types import DRIVING, OFF_DUTY, ON_DUTY_NOT_DRIVING, SLEEPER_BERTH, Segment, TripResult


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
    max_cycle_hours: float
    # Rolling 60/70-hour window bookkeeping — mirrors engine.py's _SimState
    # exactly (see that file for the full rationale). The entire pre-trip
    # cycle-hours reading is treated as a single lump accrued on one
    # notional day (the calendar day immediately before trip start), the
    # most conservative placement possible, since the API only collects one
    # flat pre-trip number, not a real day-by-day trailing history.
    pretrip_date: date = None
    pretrip_hours: float = 0.0
    cycle_cap_days: int = 8
    daily_on_duty_hours: Dict[date, float] = field(default_factory=lambda: defaultdict(float))
    restart_hours: float = c.RESTART_DURATION_HOURS
    personal_odometer: float = 0.0
    driving_hrs_in_duty_period: float = 0.0
    driving_hrs_since_break: float = 0.0
    window_hrs_elapsed: float = 0.0
    # Both start "fully rested" at trip start — neither has been driving,
    # so both are immediately eligible (unless they start at the cap).
    rest_hrs_since_last_drive: float = c.MIN_OFF_DUTY_RESET_HOURS
    # Consecutive rest actually logged in THIS trip since the driver last
    # drove — unlike rest_hrs_since_last_drive it starts at 0, because the
    # trip has no evidence of rest before it began. Drives both the 34-hour
    # cycle recovery and the sleeper-berth / passenger-seat split below.
    stint_rest_hrs: float = 0.0
    # Hit their own cycle cap; ineligible to drive until 34 hours off,
    # whether taken explicitly or accumulated "for free" while resting.
    is_capped: bool = False
    rules: HosRules = field(default_factory=HosRules)
    extended_days_remaining: int = 0
    extended_used_this_period: bool = False
    segments: List[Segment] = field(default_factory=list)

    @property
    def window_limit_hours(self) -> float:
        # Mirrors engine.py's _SimState.window_limit_hours.
        if self.extended_used_this_period or self.extended_days_remaining > 0:
            return self.rules.extended_window_hours
        return self.rules.window_hours

    def note_window_crossing(self) -> None:
        if self.extended_used_this_period:
            return
        if self.window_hrs_elapsed > self.rules.window_hours + c.HOURS_EPSILON:
            self.extended_used_this_period = True
            self.extended_days_remaining = max(0, self.extended_days_remaining - 1)
            if self.segments and self.segments[-1].status == DRIVING:
                self.segments[-1].remark = self.rules.extended_window_remark or None

    def rolling_cycle_hours(self, as_of: datetime) -> float:
        """The true rolling-window total as of `as_of`: the pre-trip lump
        (while its notional day is still inside the window) plus every
        in-trip day's on-duty hours that hasn't aged out yet."""
        window_start = as_of.date() - timedelta(days=self.cycle_cap_days - 1)
        total = self.pretrip_hours if self.pretrip_date >= window_start else 0.0
        total += sum(hours for day, hours in self.daily_on_duty_hours.items() if day >= window_start)
        return total

    def hours_until_cycle_room(self, as_of: datetime) -> Optional[float]:
        """Mirror of engine.py's _SimState.hours_until_cycle_room: the wait
        until the first midnight that frees at least one hour of driving
        room, or None if a restart would be sooner."""
        for days_ahead in range(1, self.cycle_cap_days + 1):
            midnight = datetime.combine(as_of.date() + timedelta(days=days_ahead), datetime.min.time())
            wait = (midnight - as_of).total_seconds() / 3600.0
            if wait >= self.restart_hours - c.HOURS_EPSILON:
                return None
            if self.rolling_cycle_hours(midnight) <= self.max_cycle_hours - c.CYCLE_WAIT_MIN_ROOM_HOURS:
                return wait
        return None

    def accrue_on_duty_hours(self, start: datetime, end: datetime, hours: float) -> None:
        """Credits `hours` to whichever calendar day(s) [start, end) falls
        on, splitting proportionally at midnight for a span that crosses
        one (chunks here are already bounded well under 24h by the
        break/11hr/window/fuel constraints, so at most one midnight)."""
        if hours <= 0:
            return
        total_span = (end - start).total_seconds()
        if total_span <= 0:
            self.daily_on_duty_hours[start.date()] += hours
            return
        cursor = start
        while cursor.date() < end.date():
            next_midnight = datetime.combine(cursor.date() + timedelta(days=1), datetime.min.time())
            frac = (next_midnight - cursor).total_seconds() / total_span
            self.daily_on_duty_hours[cursor.date()] += hours * frac
            cursor = next_midnight
        remaining_frac = (end - cursor).total_seconds() / total_span
        self.daily_on_duty_hours[cursor.date()] += hours * remaining_frac

    def reset_cycle(self) -> None:
        """A 34-hour restart clears the whole rolling history — both the
        pre-trip lump and every in-trip day's bucket — since every hour
        that existed before the restart is now provably outside the
        window by regulation, not just by age."""
        self.pretrip_hours = 0.0
        self.daily_on_duty_hours = defaultdict(float)

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

    def append_resting(self, start: datetime, end: datetime, location_label: str) -> None:
        """Logs a stretch of the partner's driving stint on THIS driver's
        own sheet, per the guide's team-driving pattern: at least 7
        consecutive hours in the sleeper berth, then up to 3 hours off duty
        in the passenger seat (which together satisfy the 10-hour off-duty
        requirement), then back in the berth — any passenger-seat time past
        those 3 hours would have to be logged on duty, so the driver returns
        to the berth instead. The split points fall wherever the running
        stint-rest counter crosses 7h and 10h, so one truck chunk can become
        up to three personal segments. The counter itself is advanced by
        the caller (mark_rested), after this call."""
        total = (end - start).total_seconds() / 3600.0
        cursor, elapsed = start, 0.0
        first = c.SPLIT_SB_HOURS
        second = first + c.PASSENGER_SEAT_MAX_HOURS
        while elapsed < total - c.HOURS_EPSILON:
            rested = self.stint_rest_hrs + elapsed
            if rested < first - c.HOURS_EPSILON:
                status, remark, limit = SLEEPER_BERTH, None, first - rested
            elif rested < second - c.HOURS_EPSILON:
                status, remark, limit = OFF_DUTY, "Passenger seat (off duty)", second - rested
            else:
                status, remark, limit = SLEEPER_BERTH, None, float("inf")
            piece = min(limit, total - elapsed)
            piece_end = cursor + timedelta(hours=piece)
            self.append(status, cursor, piece_end, location_label, remark=remark)
            cursor, elapsed = piece_end, elapsed + piece

    def mark_rested(self, hours: float) -> None:
        self.rest_hrs_since_last_drive += hours
        self.stint_rest_hrs += hours
        _maybe_recover_from_cap(self)

    def reset_duty_period(self):
        self.driving_hrs_in_duty_period = 0.0
        self.driving_hrs_since_break = 0.0
        self.window_hrs_elapsed = 0.0
        self.extended_used_this_period = False


def _maybe_recover_from_cap(driver: _DriverClock) -> None:
    """A capped driver recovers the instant the consecutive rest logged in
    this trip reaches 34 hours — via an explicit shared restart or just from
    sitting in the resting role long enough while their partner kept
    driving. Only rest the trip can vouch for counts (stint_rest_hrs),
    never the assumed pre-trip rest."""
    if driver.is_capped and driver.stint_rest_hrs >= driver.restart_hours - c.HOURS_EPSILON:
        driver.is_capped = False
        driver.reset_cycle()


def _shared_wait(truck: _TruckState, active: _DriverClock, resting: _DriverClock, duration_hours: float, label: str) -> None:
    """The truck idles while the resting partner finishes their required
    rest before it's safe to legally swap — the active driver, having
    already used their own legal budget, rests too. Each driver's own
    sheet says what the block means for *them*."""
    start = truck.current_time
    end = start + timedelta(hours=duration_hours)
    truck.append_segment(
        SLEEPER_BERTH, duration_hours, label, truck.odometer_miles,
        remark=f"Stopped {duration_hours:.1f}h until co-driver completes 10 hours off", stop_type="rest",
    )
    active.append(SLEEPER_BERTH, start, end, label, remark="Sleeper berth (daily limit reached)", stop_type="rest")
    resting.append(SLEEPER_BERTH, start, end, label, remark="Sleeper berth (completing 10-hour rest)", stop_type="rest")
    resting.mark_rested(duration_hours)


def _append_shared_rest(
    truck: _TruckState, active: _DriverClock, resting: _DriverClock, label: str,
    duration: float, remark: str, stop_type: str, resting_remark: Optional[str] = None,
) -> None:
    """The one-segment append shared by every solo-style rest variant below
    — truck, active, and resting all get the same block (the truck isn't
    moving, so both drivers are along for it). The resting partner's sheet
    carries its own wording: the stop is the active driver's reset, not
    theirs, unless the caller says otherwise (a shared restart)."""
    start = truck.current_time
    end = start + timedelta(hours=duration)
    truck.append_segment(SLEEPER_BERTH, duration, label, truck.odometer_miles, remark=remark, stop_type=stop_type)
    active.append(SLEEPER_BERTH, start, end, label, remark=remark, stop_type=stop_type)
    resting.append(SLEEPER_BERTH, start, end, label, remark=resting_remark or remark, stop_type=stop_type)
    resting.mark_rested(duration)


def _insert_solo_style_reset(
    truck: _TruckState, active: _DriverClock, resting: _DriverClock, label: str, is_restart: bool
) -> None:
    """The partner is unavailable (already capped, waiting on their own
    34-hour recovery) or both drivers are capped at once — the truck falls
    back to ordinary solo behavior: active takes their own reset/restart,
    no role swap. If both were capped, this one shared stop clears both.

    Like engine.py, the daily reset is always a plain 10 consecutive hours
    (never a §395.1(g) split — see _drive_leg's note there), the daily
    clocks only clear when the block is at least 10 hours long, and a
    cycle-cap stop waits for old hours to age off the rolling window when
    that is sooner than a restart."""
    if is_restart:
        wait = active.hours_until_cycle_room(truck.current_time)
        if wait is not None:
            _append_shared_rest(
                truck, active, resting, label, wait,
                f"Off duty {wait:.1f}h until older hours age off the {active.cycle_cap_days}-day window", "cycle_wait",
                resting_remark="Sleeper berth (truck stopped for co-driver's cycle wait)",
            )
            if wait >= c.MIN_OFF_DUTY_RESET_HOURS - c.HOURS_EPSILON:
                active.reset_duty_period()
            return
        duration = active.restart_hours
        remark = f"{active.restart_hours:g}-hour restart (cycle reset)"
        _append_shared_rest(truck, active, resting, label, duration, remark, "restart")
        if duration >= c.MIN_OFF_DUTY_RESET_HOURS - c.HOURS_EPSILON:
            active.reset_duty_period()
        active.reset_cycle()
        return

    _append_shared_rest(
        truck, active, resting, label, c.MIN_OFF_DUTY_RESET_HOURS, "10-hour rest", "rest",
        resting_remark="Sleeper berth (truck stopped for co-driver's 10-hour rest)",
    )
    active.reset_duty_period()


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
    active.stint_rest_hrs = 0.0
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
    active.stint_rest_hrs = 0.0
    return resting, active


def _drive_leg_team(
    truck: _TruckState, active: _DriverClock, resting: _DriverClock, leg_distance_miles: float, dest_label: str
) -> Tuple[_DriverClock, _DriverClock]:
    if leg_distance_miles <= c.MILES_EPSILON:
        truck.location_label = dest_label
        return active, resting

    miles_remaining = leg_distance_miles

    while miles_remaining > c.MILES_EPSILON:
        miles_to_break = (
            max((c.DRIVING_HOURS_BEFORE_BREAK - active.driving_hrs_since_break) * c.AVG_TRUCK_SPEED_MPH, 0.0)
            if active.rules.break_required
            else float("inf")
        )
        miles_to_11hr = max(
            (c.MAX_DRIVING_HOURS_PER_PERIOD - active.driving_hrs_in_duty_period) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )
        miles_to_window = max(
            (active.window_limit_hours - active.window_hrs_elapsed) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )
        miles_to_fuel = max(c.FUEL_INTERVAL_MILES - truck.miles_since_fuel, 0.0)
        miles_to_cycle = max(
            (active.max_cycle_hours - active.rolling_cycle_hours(truck.current_time)) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )

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
            resting.append_resting(start, end, truck.location_label)  # odometer frozen — not their miles

            active.driving_hrs_in_duty_period += chunk_hours
            active.driving_hrs_since_break += chunk_hours
            active.window_hrs_elapsed += chunk_hours
            active.accrue_on_duty_hours(start, end, chunk_hours)
            active.note_window_crossing()
            resting.mark_rested(chunk_hours)
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
        elif break_due:
            duration, remark, is_fuel_stop, stop_type = c.MANDATORY_BREAK_DURATION_HOURS, "Mandatory 30-minute break", False, "break"
        else:  # pragma: no cover
            raise RuntimeError("team drive loop stalled without a binding constraint")

        # Not gated on the cycle cap: §395.3(b) only forbids *driving* past
        # it, so on-duty-not-driving work may exceed the cap. The driving
        # loop above handles the cap before the next chunk is driven.
        start = truck.current_time
        end = start + timedelta(hours=duration)
        truck.append_segment(ON_DUTY_NOT_DRIVING, duration, label, truck.odometer_miles, remark=remark, stop_type=stop_type)
        active.append(ON_DUTY_NOT_DRIVING, start, end, label, remark=remark, stop_type=stop_type)
        resting.append_resting(start, end, label)

        active.accrue_on_duty_hours(start, end, duration)
        active.window_hrs_elapsed += duration
        if duration >= c.MANDATORY_BREAK_DURATION_HOURS - c.HOURS_EPSILON:
            active.driving_hrs_since_break = 0.0
        if is_fuel_stop:
            truck.miles_since_fuel = 0.0
        resting.mark_rested(duration)

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
    driver_2_cycle_used_hours: Optional[float] = None,
    cycle_cap_days: int = 8,
    driving_hours_today: float = 0.0,
    on_duty_hours_today: float = 0.0,
    rules: Optional[HosRules] = None,
    leg3_distance_miles: float = 0.0,
    reporting_location_label: Optional[str] = None,
) -> Tuple[TripResult, List[Segment], List[Segment]]:
    """Returns (truck-level TripResult for map/stops, driver_1's personal
    segments, driver_2's personal segments). `driver_2_cycle_used_hours`
    defaults to `current_cycle_used_hours` only when the caller doesn't
    supply a real value for the co-driver — two actual people essentially
    never share the exact same cycle-hours reading, so a dispatcher who
    knows both numbers should be able to enter both. Driver 1 always starts
    active at trip start."""
    rules = rules or HosRules()
    truck = _TruckState(current_time=trip_start, odometer_miles=0.0, location_label=current_location_label)
    pretrip_date = trip_start.date()  # same conservative placement as engine.py
    driver_2_hours = current_cycle_used_hours if driver_2_cycle_used_hours is None else driver_2_cycle_used_hours
    driver_1 = _DriverClock(
        driver_id="driver_1", max_cycle_hours=max_cycle_hours, restart_hours=restart_hours,
        pretrip_date=pretrip_date, pretrip_hours=current_cycle_used_hours, cycle_cap_days=cycle_cap_days,
        # Driver 1 starts active, so the "hours already used today" inputs
        # describe their current duty period; driver 2 is assumed rested.
        driving_hrs_in_duty_period=driving_hours_today,
        driving_hrs_since_break=min(driving_hours_today, c.DRIVING_HOURS_BEFORE_BREAK),
        window_hrs_elapsed=max(on_duty_hours_today, driving_hours_today),
        # A driver entered at (or past) the cap is capped from the first
        # minute, so their 34-hour recovery clock runs from trip start
        # instead of from the first time they are asked to drive.
        is_capped=current_cycle_used_hours >= max_cycle_hours - c.HOURS_EPSILON,
        rules=rules,
        extended_days_remaining=rules.extended_window_days,
    )
    driver_2 = _DriverClock(
        driver_id="driver_2",
        max_cycle_hours=max_cycle_hours,
        restart_hours=restart_hours,
        pretrip_date=pretrip_date,
        pretrip_hours=driver_2_hours,
        cycle_cap_days=cycle_cap_days,
        is_capped=driver_2_hours >= max_cycle_hours - c.HOURS_EPSILON,
        rules=rules,
        extended_days_remaining=rules.extended_window_days,
    )
    active, resting = driver_1, driver_2

    active, resting = _drive_leg_team(truck, active, resting, leg1_distance_miles, pickup_location_label)

    # Pickup/dropoff: performed by whoever is currently active. Not gated
    # on the cycle cap — on-duty-not-driving work past the cap is legal
    # (§395.3(b)); only the next driving chunk needs the cap clear.
    for duration, label, remark, stop_type in (
        (c.PICKUP_DURATION_HOURS, pickup_location_label, "Picking up load", "pickup"),
    ):
        start = truck.current_time
        end = start + timedelta(hours=duration)
        truck.append_segment(ON_DUTY_NOT_DRIVING, duration, label, truck.odometer_miles, remark=remark, stop_type=stop_type)
        active.append(ON_DUTY_NOT_DRIVING, start, end, label, remark=remark, stop_type=stop_type)
        resting.append_resting(start, end, label)
        active.accrue_on_duty_hours(start, end, duration)
        active.window_hrs_elapsed += duration
        active.driving_hrs_since_break = 0.0
        resting.mark_rested(duration)

    active, resting = _drive_leg_team(truck, active, resting, leg2_distance_miles, dropoff_location_label)

    on_duty_blocks = [(c.DROPOFF_DURATION_HOURS, dropoff_location_label, "Delivering load", "dropoff")]
    has_return = leg3_distance_miles > c.MILES_EPSILON and bool(reporting_location_label)
    for i, (duration, label, remark, stop_type) in enumerate(on_duty_blocks):
        start = truck.current_time
        end = start + timedelta(hours=duration)
        truck.append_segment(ON_DUTY_NOT_DRIVING, duration, label, truck.odometer_miles, remark=remark, stop_type=stop_type)
        active.append(ON_DUTY_NOT_DRIVING, start, end, label, remark=remark, stop_type=stop_type)
        resting.append_resting(start, end, label)
        active.accrue_on_duty_hours(start, end, duration)
        active.window_hrs_elapsed += duration
        resting.mark_rested(duration)

    if has_return:
        active, resting = _drive_leg_team(truck, active, resting, leg3_distance_miles, reporting_location_label)
        duration, label = c.RETURN_CHECKIN_HOURS, reporting_location_label
        remark, stop_type = "Returned to work reporting location; released from duty", "return"
        start = truck.current_time
        end = start + timedelta(hours=duration)
        truck.append_segment(ON_DUTY_NOT_DRIVING, duration, label, truck.odometer_miles, remark=remark, stop_type=stop_type)
        active.append(ON_DUTY_NOT_DRIVING, start, end, label, remark=remark, stop_type=stop_type)
        resting.append_resting(start, end, label)
        active.accrue_on_duty_hours(start, end, duration)
        active.window_hrs_elapsed += duration
        resting.mark_rested(duration)

    total_distance = leg1_distance_miles + leg2_distance_miles + max(leg3_distance_miles, 0.0)
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
