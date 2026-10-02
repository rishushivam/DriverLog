"""Pure Hours-of-Service trip simulator (49 CFR Part 395).

Property-carrying drivers under §395.3, optionally with the daily-rule
relaxations of the short-haul (§395.1(e)) and 16-hour (§395.1(o))
exceptions supplied as a `HosRules` (see rules.py). No adverse-driving-
conditions exception: it covers only conditions unknown at dispatch, so a
planner can never legitimately plan on it.

This module has zero Django/HTTP imports. It consumes already-known leg
distances (miles) and emits a flat, contiguous list of duty-status
`Segment`s for the whole trip. Time math is entirely the engine's own
(distance / AVG_TRUCK_SPEED_MPH) — it never trusts an external routing
API's notion of "duration", so mileage and the simulated clock can never
disagree with each other.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from . import constants as c
from .rules import HosRules
from .types import DRIVING, ON_DUTY_NOT_DRIVING, SLEEPER_BERTH, Segment, TripResult


def _is_close(a: float, b: float, tol: float = c.MILES_EPSILON) -> bool:
    return abs(a - b) <= tol


@dataclass
class _SimState:
    current_time: datetime
    odometer_miles: float
    location_label: str
    # The 60/70-hour limit is a *rolling* 7/8-day window (49 CFR §395.3(b)):
    # the oldest day's hours drop off as each new day begins, with or
    # without a restart. The API only collects one flat number for hours
    # already used before the trip, not a real day-by-day breakdown, so
    # that whole lump is attributed to one notional day — the trip's own
    # start date — which is the most conservative placement possible (it
    # stays in the rolling window for as long as the window could ever
    # keep it, so this simplification only ever makes the engine *more*
    # cautious, never less). `daily_on_duty_hours` then
    # accrues the real, correctly-dated hours for every day the simulation
    # itself covers. See rolling_cycle_hours() below — nothing but that
    # method may decide whether the cycle cap binds.
    pretrip_date: date
    pretrip_hours: float
    cycle_cap_days: int = 8
    max_cycle_hours: float = c.MAX_CYCLE_HOURS
    restart_hours: float = c.RESTART_DURATION_HOURS
    driving_hrs_in_duty_period: float = 0.0
    driving_hrs_since_break: float = 0.0
    window_hrs_elapsed: float = 0.0
    miles_since_fuel: float = 0.0
    rules: HosRules = field(default_factory=HosRules)
    # Extended-window bookkeeping (16-hour / non-CDL second tier): how many
    # more duty periods may run past rules.window_hours, and whether the
    # current period already has.
    extended_days_remaining: int = 0
    extended_used_this_period: bool = False
    daily_on_duty_hours: Dict[date, float] = field(default_factory=lambda: defaultdict(float))
    segments: List[Segment] = field(default_factory=list)

    @property
    def window_limit_hours(self) -> float:
        """The window this duty period may run to: the ordinary 14 hours,
        or the exception's longer window while extensions remain (or once
        this period has already committed to one)."""
        if self.extended_used_this_period or self.extended_days_remaining > 0:
            return self.rules.extended_window_hours
        return self.rules.window_hours

    def note_window_crossing(self) -> None:
        """Called after each driving chunk: if driving has now gone past
        the ordinary window, this period consumes one extension and the
        segment that crossed is annotated with the rule relied on."""
        if self.extended_used_this_period:
            return
        if self.window_hrs_elapsed > self.rules.window_hours + c.HOURS_EPSILON:
            self.extended_used_this_period = True
            self.extended_days_remaining = max(0, self.extended_days_remaining - 1)
            if self.segments and self.segments[-1].status == DRIVING:
                self.segments[-1].remark = self.rules.extended_window_remark or None

    def rolling_cycle_hours(self, as_of: Optional[datetime] = None) -> float:
        """The true rolling-window total as of `as_of` (default: now): the
        pre-trip lump (while its notional day is still inside the window)
        plus every in-trip day's on-duty hours that hasn't aged out yet."""
        as_of = as_of or self.current_time
        window_start = as_of.date() - timedelta(days=self.cycle_cap_days - 1)
        total = self.pretrip_hours if self.pretrip_date >= window_start else 0.0
        total += sum(hours for day, hours in self.daily_on_duty_hours.items() if day >= window_start)
        return total

    def hours_until_cycle_room(self) -> Optional[float]:
        """§395.3(b)'s own alternative to a restart: hours only ever leave
        the rolling window at midnight, so this finds the first upcoming
        midnight at which the window would have at least one hour of
        driving room again, and returns how long that wait is — or None if
        no such midnight comes sooner than a restart would (a restart is
        then strictly better, since it clears everything at once)."""
        for days_ahead in range(1, self.cycle_cap_days + 1):
            midnight = datetime.combine(self.current_time.date() + timedelta(days=days_ahead), datetime.min.time())
            wait = (midnight - self.current_time).total_seconds() / 3600.0
            if wait >= self.restart_hours - c.HOURS_EPSILON:
                return None
            if self.rolling_cycle_hours(as_of=midnight) <= self.max_cycle_hours - c.CYCLE_WAIT_MIN_ROOM_HOURS:
                return wait
        return None

    def accrue_on_duty_hours(self, start: datetime, end: datetime, hours: float) -> None:
        """Credits `hours` to whichever calendar day(s) [start, end) falls
        on, splitting proportionally at midnight — every caller's intervals
        are already well under 24h (bounded by the break/11hr/window/fuel
        constraints), so this never needs to split more than once."""
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
        """A 34-hour restart clears the whole rolling history — every hour
        before the restart, pre-trip or in-trip, stops counting."""
        self.pretrip_hours = 0.0
        self.daily_on_duty_hours = defaultdict(float)

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


def _resolve_cycle_cap(state: _SimState, label: str) -> None:
    """The cycle cap binds. The regulation offers two ways out — wait for
    old days to age off the rolling window, or take a 34-hour restart —
    and the guide is explicit that the restart is optional. Take whichever
    gets the truck moving sooner."""
    wait = state.hours_until_cycle_room()
    if wait is None:
        _insert_forced_rest(state, is_restart=True, label=label)
        return
    _insert_forced_rest(state, is_restart=False, label=label, duration=wait,
                        remark=f"Off duty {wait:.1f}h until older hours age off the {state.cycle_cap_days}-day window",
                        stop_type="cycle_wait")


def _insert_forced_rest(
    state: _SimState, is_restart: bool, label: str,
    duration: Optional[float] = None, remark: Optional[str] = None, stop_type: Optional[str] = None,
) -> None:
    if duration is None:
        duration = state.restart_hours if is_restart else c.MIN_OFF_DUTY_RESET_HOURS
    if remark is None:
        remark = f"{state.restart_hours:g}-hour restart (cycle reset)" if is_restart else "10-hour rest"
    if stop_type is None:
        stop_type = "restart" if is_restart else "rest"
    state.append_segment(
        SLEEPER_BERTH, duration, label, state.odometer_miles, remark=remark, stop_type=stop_type
    )
    # The 11-hour / 14-hour / 8-hour clocks only restart after at least 10
    # consecutive hours off duty (§395.3(a)(1)). A restart is normally 34h
    # and always clears them; the guard matters only for a "what-if"
    # restart_hours shorter than the daily minimum (the API refuses those,
    # but the engine must never reset daily clocks on <10h of rest either way).
    if duration >= c.MIN_OFF_DUTY_RESET_HOURS - c.HOURS_EPSILON:
        state.driving_hrs_in_duty_period = 0.0
        state.driving_hrs_since_break = 0.0
        state.window_hrs_elapsed = 0.0
        state.extended_used_this_period = False
    if is_restart:
        state.reset_cycle()
    # miles_since_fuel is deliberately NOT reset here — resting doesn't refuel the truck.


def _do_fixed_stop(
    state: _SimState,
    duration_hours: float,
    label: str,
    remark: str,
    is_fuel_stop: bool,
    stop_type: str,
) -> None:
    # Deliberately NOT gated on the 60/70-hour cycle cap: §395.3(b) only
    # forbids *driving* past the cap — a driver may keep doing on-duty,
    # not-driving work (a pickup, a dropoff, a fuel stop) beyond it. The
    # cap is enforced solely in _drive_leg, which will insert the restart
    # before the next driving chunk if this block pushed the total over.
    start = state.current_time
    state.append_segment(
        ON_DUTY_NOT_DRIVING, duration_hours, label, state.odometer_miles, remark=remark, stop_type=stop_type
    )
    state.accrue_on_duty_hours(start, state.current_time, duration_hours)
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
        # Under either short-haul exception the 30-minute break is waived
        # (§395.1(e)); the break clock then never binds.
        miles_to_break = (
            max((c.DRIVING_HOURS_BEFORE_BREAK - state.driving_hrs_since_break) * c.AVG_TRUCK_SPEED_MPH, 0.0)
            if state.rules.break_required
            else float("inf")
        )
        miles_to_11hr = max(
            (c.MAX_DRIVING_HOURS_PER_PERIOD - state.driving_hrs_in_duty_period) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )
        miles_to_window = max(
            (state.window_limit_hours - state.window_hrs_elapsed) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )
        miles_to_fuel = max(c.FUEL_INTERVAL_MILES - state.miles_since_fuel, 0.0)
        # The only read of the rolling window that decides whether driving
        # can continue — see _SimState.rolling_cycle_hours.
        miles_to_cycle = max(
            (state.max_cycle_hours - state.rolling_cycle_hours()) * c.AVG_TRUCK_SPEED_MPH, 0.0
        )

        chunk_miles = min(
            miles_to_break, miles_to_11hr, miles_to_window, miles_to_fuel, miles_to_cycle, miles_remaining
        )

        if chunk_miles > c.MILES_EPSILON:
            chunk_hours = chunk_miles / c.AVG_TRUCK_SPEED_MPH
            new_odometer = state.odometer_miles + chunk_miles
            chunk_start = state.current_time
            state.append_segment(DRIVING, chunk_hours, state.location_label, new_odometer)
            state.driving_hrs_in_duty_period += chunk_hours
            state.driving_hrs_since_break += chunk_hours
            state.window_hrs_elapsed += chunk_hours
            state.accrue_on_duty_hours(chunk_start, state.current_time, chunk_hours)
            state.note_window_crossing()
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
            _resolve_cycle_cap(state, label)
            continue
        # The 11-hour driving limit and the 14-hour window both clear only
        # with a full 10 consecutive hours off duty / sleeper berth. The
        # §395.1(g) sleeper-berth split is intentionally not used by this
        # planner: a 7-hour first period taken when a limit binds leaves the
        # paused window with nothing left (time on both sides of the first
        # period still counts), so it always degenerates into 7h+3h back to
        # back — the same 10 hours, mislabelled — and never beats a plain
        # reset for a planner that simply drives until a limit binds.
        if _is_close(chunk_miles, miles_to_11hr) or _is_close(chunk_miles, miles_to_window):
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
        elif break_due:
            _do_fixed_stop(
                state,
                c.MANDATORY_BREAK_DURATION_HOURS,
                label,
                "Mandatory 30-minute break",
                is_fuel_stop=False,
                stop_type="break",
            )
        else:  # pragma: no cover - every binding constraint is handled above
            raise RuntimeError("drive loop stalled without a binding constraint")


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
    cycle_cap_days: int = 8,
    driving_hours_today: float = 0.0,
    on_duty_hours_today: float = 0.0,
    rules: Optional[HosRules] = None,
    leg3_distance_miles: float = 0.0,
    reporting_location_label: Optional[str] = None,
) -> TripResult:
    """`driving_hours_today` / `on_duty_hours_today` describe the driver's
    *current* duty period at trip start (hours driven, and hours since the
    14-hour window opened, since their last 10-hour rest). Both default to
    a fresh clock. They are assumed to already be inside
    `current_cycle_used_hours`, so they are not accrued again.

    `rules` selects the daily rules (standard §395.3 by default; see
    rules.py for the short-haul / 16-hour variants). `leg3_distance_miles`
    is an optional return leg from the dropoff back to the work reporting
    location, which every short-haul and 16-hour day requires."""
    rules = rules or HosRules()
    state = _SimState(
        current_time=trip_start,
        odometer_miles=0.0,
        location_label=current_location_label,
        # The entire pre-trip total is attributed to the trip's own start
        # date — see _SimState's own docstring for why.
        pretrip_date=trip_start.date(),
        pretrip_hours=current_cycle_used_hours,
        cycle_cap_days=cycle_cap_days,
        max_cycle_hours=max_cycle_hours,
        restart_hours=restart_hours,
        driving_hrs_in_duty_period=driving_hours_today,
        # No knowledge of when the last 30-minute break was — assume none
        # yet, which is the conservative reading (a break comes due sooner).
        driving_hrs_since_break=min(driving_hours_today, c.DRIVING_HOURS_BEFORE_BREAK),
        window_hrs_elapsed=max(on_duty_hours_today, driving_hours_today),
        rules=rules,
        extended_days_remaining=rules.extended_window_days,
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

    if leg3_distance_miles > c.MILES_EPSILON and reporting_location_label:
        _drive_leg(state, leg3_distance_miles, reporting_location_label)
        _do_fixed_stop(
            state, c.RETURN_CHECKIN_HOURS, reporting_location_label, "Returned to work reporting location; released from duty",
            is_fuel_stop=False, stop_type="return",
        )

    total_distance = leg1_distance_miles + leg2_distance_miles + max(leg3_distance_miles, 0.0)
    trip_span_hours = (state.segments[-1].end_datetime - state.segments[0].start_datetime).total_seconds() / 3600.0
    return TripResult(
        segments=state.segments,
        total_distance_miles=total_distance,
        total_duration_hours=total_distance / c.AVG_TRUCK_SPEED_MPH,
        total_trip_span_hours=trip_span_hours,
    )
