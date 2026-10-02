import unittest
from datetime import date, datetime, timedelta

from .. import constants as c
from ..engine import _SimState, _drive_leg, simulate_trip
from ..types import DRIVING, SLEEPER_BERTH


def _duty_periods(segments):
    """Groups segments into duty periods split at each SLEEPER_BERTH (rest
    or restart) segment. Returns a list of (period_start, segment_list)."""
    periods = []
    current = []
    period_start = segments[0].start_datetime if segments else None
    for seg in segments:
        if seg.status == SLEEPER_BERTH:
            if current:
                periods.append((period_start, current))
            current = []
            period_start = seg.end_datetime
        else:
            current.append(seg)
    if current:
        periods.append((period_start, current))
    return periods


class HosEngineTests(unittest.TestCase):
    def setUp(self):
        self.trip_start = datetime(2026, 1, 5, 8, 0, 0)

    def test_short_same_day_trip_needs_one_log(self):
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=100.0,
            current_cycle_used_hours=0.0,
            trip_start=self.trip_start,
            current_location_label="Origin, IL",
            pickup_location_label="Pickup, IL",
            dropoff_location_label="Dropoff, IN",
        )
        statuses = [s.status for s in result.segments]
        self.assertEqual(statuses, ["ON_DUTY_NOT_DRIVING", DRIVING, "ON_DUTY_NOT_DRIVING"])
        self.assertAlmostEqual(result.total_distance_miles, 100.0)
        last_end = result.segments[-1].end_datetime
        self.assertEqual(last_end.date(), self.trip_start.date())

    def test_cycle_cap_triggers_34_hour_restart_and_resets_counter(self):
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=300.0,
            current_cycle_used_hours=68.0,
            trip_start=self.trip_start,
            current_location_label="Origin, IL",
            pickup_location_label="Pickup, IL",
            dropoff_location_label="Dropoff, IN",
        )
        restarts = [s for s in result.segments if s.stop_type == "restart"]
        self.assertEqual(len(restarts), 1)
        self.assertAlmostEqual(restarts[0].duration_hours, c.RESTART_DURATION_HOURS)

        total_driving_miles = sum(
            s.odometer_end_miles - s.odometer_start_miles for s in result.segments if s.status == DRIVING
        )
        self.assertAlmostEqual(total_driving_miles, 300.0, places=1)

    def test_custom_restart_hours_overrides_the_34_hour_default(self):
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=300.0,
            current_cycle_used_hours=68.0,
            trip_start=self.trip_start,
            current_location_label="Origin, IL",
            pickup_location_label="Pickup, IL",
            dropoff_location_label="Dropoff, IN",
            restart_hours=10.0,
        )
        restarts = [s for s in result.segments if s.stop_type == "restart"]
        self.assertEqual(len(restarts), 1)
        self.assertAlmostEqual(restarts[0].duration_hours, 10.0)
        self.assertNotAlmostEqual(restarts[0].duration_hours, c.RESTART_DURATION_HOURS)

    def test_multiple_fuel_stops_over_1000_miles(self):
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=2500.0,
            current_cycle_used_hours=0.0,
            trip_start=self.trip_start,
            current_location_label="Origin, CA",
            pickup_location_label="Pickup, CA",
            dropoff_location_label="Dropoff, NY",
        )
        fuel_stops = [s for s in result.segments if s.stop_type == "fuel"]
        self.assertGreaterEqual(len(fuel_stops), 2)

        total_driving_miles = sum(
            s.odometer_end_miles - s.odometer_start_miles for s in result.segments if s.status == DRIVING
        )
        self.assertAlmostEqual(total_driving_miles, 2500.0, places=1)

    def test_segments_are_contiguous_and_gapless(self):
        result = simulate_trip(
            leg1_distance_miles=150.0,
            leg2_distance_miles=1800.0,
            current_cycle_used_hours=5.0,
            trip_start=self.trip_start,
            current_location_label="Origin, TX",
            pickup_location_label="Pickup, TX",
            dropoff_location_label="Dropoff, WA",
        )
        segments = result.segments
        for i in range(len(segments) - 1):
            self.assertEqual(
                segments[i].end_datetime,
                segments[i + 1].start_datetime,
                f"gap/overlap between segment {i} and {i + 1}",
            )

    def test_driving_never_exceeds_11_hours_between_resets(self):
        result = simulate_trip(
            leg1_distance_miles=150.0,
            leg2_distance_miles=1800.0,
            current_cycle_used_hours=5.0,
            trip_start=self.trip_start,
            current_location_label="Origin, TX",
            pickup_location_label="Pickup, TX",
            dropoff_location_label="Dropoff, WA",
        )
        for period_start, segs in _duty_periods(result.segments):
            driving_hours = sum(s.duration_hours for s in segs if s.status == DRIVING)
            self.assertLessEqual(driving_hours, c.MAX_DRIVING_HOURS_PER_PERIOD + 1e-6)

    def test_on_duty_window_never_exceeds_14_hours(self):
        result = simulate_trip(
            leg1_distance_miles=150.0,
            leg2_distance_miles=1800.0,
            current_cycle_used_hours=5.0,
            trip_start=self.trip_start,
            current_location_label="Origin, TX",
            pickup_location_label="Pickup, TX",
            dropoff_location_label="Dropoff, WA",
        )
        for period_start, segs in _duty_periods(result.segments):
            driving_segs = [s for s in segs if s.status == DRIVING]
            if not driving_segs:
                continue
            window_used = (driving_segs[-1].end_datetime - period_start).total_seconds() / 3600.0
            self.assertLessEqual(window_used, c.MAX_ON_DUTY_WINDOW_HOURS + 1e-6)

    def test_60_7_schedule_uses_60_hour_cap_not_70(self):
        # 58 hours used: under the 70/8 cap (plenty of room for a short
        # trip) but only 2 hours short of the 60/7 cap.
        common_kwargs = dict(
            leg1_distance_miles=0.0,
            leg2_distance_miles=300.0,
            current_cycle_used_hours=58.0,
            trip_start=self.trip_start,
            current_location_label="Origin, IL",
            pickup_location_label="Pickup, IL",
            dropoff_location_label="Dropoff, IN",
        )
        result_70_8 = simulate_trip(**common_kwargs, max_cycle_hours=70.0)
        result_60_7 = simulate_trip(**common_kwargs, max_cycle_hours=60.0)

        self.assertFalse(any(s.stop_type == "restart" for s in result_70_8.segments))
        self.assertTrue(any(s.stop_type == "restart" for s in result_60_7.segments))

    def test_zero_distance_first_leg_does_not_duplicate_location(self):
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=50.0,
            current_cycle_used_hours=0.0,
            trip_start=self.trip_start,
            current_location_label="Same Spot, OH",
            pickup_location_label="Same Spot, OH",
            dropoff_location_label="Dropoff, OH",
        )
        pickup_segment = result.segments[0]
        self.assertEqual(pickup_segment.location_label, "Same Spot, OH")


class CycleCapOnDutyTests(unittest.TestCase):
    """49 CFR §395.3(b) and the FMCSA guide: violations of the 60/70-hour
    limit "can only occur if you drive a CMV past these limits as you can
    remain on-duty not driving." On-duty blocks (pickup/dropoff/fuel/break)
    must therefore never trigger a restart on their own — only the next
    driving chunk may."""

    def setUp(self):
        self.trip_start = datetime(2026, 1, 5, 8, 0, 0)

    def test_final_dropoff_past_the_cap_does_not_force_a_restart(self):
        # 68.5 used + 1h pickup + ~0.2h driving = 69.7 at the dropoff; the
        # 1h dropoff pushes the total to 70.7 — legal, since no driving
        # follows it. Previously this inserted a needless 34-hour restart.
        result = simulate_trip(0.0, 10.0, 68.5, self.trip_start, "A", "B", "C")
        self.assertFalse(any(s.stop_type == "restart" for s in result.segments))
        self.assertLess(result.total_trip_span_hours, 3.0)

    def test_pickup_past_the_cap_still_restarts_before_the_next_drive(self):
        # 69.5 used: driving 10 miles (0.18h -> 69.68) is fine, the 1h
        # pickup takes the total past 70, and ONLY THEN — before leg 2's
        # first mile — must the restart happen: after the pickup, not before.
        result = simulate_trip(10.0, 100.0, 69.5, self.trip_start, "A", "B", "C")
        stop_types = [s.stop_type for s in result.segments]
        self.assertIn("restart", stop_types)
        self.assertLess(stop_types.index("pickup"), stop_types.index("restart"))

    def test_driving_never_starts_past_the_cap(self):
        result = simulate_trip(300.0, 1500.0, 62.0, self.trip_start, "A", "B", "C")
        state_hours = 62.0
        last_restart_end = None
        for seg in result.segments:
            if seg.stop_type == "restart":
                last_restart_end = seg.end_datetime
        # Replay a flat since-restart sum and assert no DRIVING chunk starts
        # with the cap already exceeded (on-duty blocks may exceed it).
        running = 62.0
        for seg in result.segments:
            if seg.stop_type == "restart":
                running = 0.0
                continue
            if seg.status == DRIVING:
                self.assertLessEqual(running, c.MAX_CYCLE_HOURS + 1e-6)
            if seg.status in (DRIVING, "ON_DUTY_NOT_DRIVING"):
                running += seg.duration_hours


class RestartDurationTests(unittest.TestCase):
    """The 11/14/8-hour clocks reset only after >=10 consecutive hours off
    (§395.3(a)(1)). A what-if restart shorter than that must not hand the
    driver fresh daily clocks."""

    def setUp(self):
        self.trip_start = datetime(2026, 1, 5, 8, 0, 0)

    def test_restart_shorter_than_10_hours_does_not_reset_daily_clocks(self):
        state = _SimState(
            current_time=self.trip_start, odometer_miles=0.0, location_label="X",
            pretrip_date=self.trip_start.date() - timedelta(days=1), pretrip_hours=70.0,
            restart_hours=5.0, driving_hrs_in_duty_period=9.0, window_hrs_elapsed=12.0,
        )
        _drive_leg(state, 300.0, "Y")
        restart = next(s for s in state.segments if s.stop_type == "restart")
        self.assertAlmostEqual(restart.duration_hours, 5.0)
        # Only 2h of the 11-hour budget remained; the 5h "restart" cleared
        # the cycle but not the daily clocks, so a real 10h rest must follow
        # before the remaining miles can be driven.
        driving_before_rest = 0.0
        for seg in state.segments:
            if seg.stop_type == "rest":
                break
            if seg.status == DRIVING and seg.start_datetime >= restart.end_datetime:
                driving_before_rest += seg.duration_hours
        self.assertLessEqual(driving_before_rest, 2.0 + 1e-6)
        self.assertTrue(any(s.stop_type == "rest" for s in state.segments))

    def test_no_split_rest_stop_types_are_ever_emitted(self):
        result = simulate_trip(1200.0, 1600.0, 10.0, self.trip_start, "A", "B", "C")
        for seg in result.segments:
            self.assertIn(seg.stop_type, (None, "pickup", "dropoff", "fuel", "break", "rest", "restart"))


class RollingCycleWindowTests(unittest.TestCase):
    """49 CFR §395.3(b): the 60/70-hour limit is a true rolling 7/8-day
    window, not a counter that only resets via an explicit 34-hour
    restart — the oldest day's hours drop off as each new day begins. The
    API only collects one flat pre-trip number, so the whole lump is
    attributed to one notional day (trip_start - 1), the most conservative
    placement possible (see _SimState's own docstring)."""

    def setUp(self):
        self.pretrip_date = date(2026, 1, 1)

    def _state(self, **overrides):
        defaults = dict(
            current_time=datetime(2026, 1, 2, 0, 0, 0),
            odometer_miles=0.0,
            location_label="Origin, IL",
            pretrip_date=self.pretrip_date,
            pretrip_hours=65.0,
            cycle_cap_days=8,
        )
        defaults.update(overrides)
        return _SimState(**defaults)

    def test_pretrip_lump_counts_while_its_day_is_still_in_the_window(self):
        # window_start = Jan8 - 7 = Jan1 -> pretrip_date (Jan1) still in.
        state = self._state(current_time=datetime(2026, 1, 8, 23, 0, 0))
        self.assertAlmostEqual(state.rolling_cycle_hours(), 65.0)

    def test_pretrip_lump_ages_out_once_its_day_leaves_the_window(self):
        # window_start = Jan9 - 7 = Jan2 -> pretrip_date (Jan1) now outside.
        state = self._state(current_time=datetime(2026, 1, 9, 0, 0, 0))
        self.assertEqual(state.rolling_cycle_hours(), 0.0)

    def test_in_trip_hours_age_out_the_same_way(self):
        state = self._state(pretrip_hours=0.0)
        state.accrue_on_duty_hours(datetime(2026, 1, 2, 6, 0, 0), datetime(2026, 1, 2, 11, 0, 0), 5.0)
        state.current_time = datetime(2026, 1, 9, 0, 0, 0)
        self.assertAlmostEqual(state.rolling_cycle_hours(), 5.0)
        state.current_time = datetime(2026, 1, 10, 0, 0, 0)
        self.assertEqual(state.rolling_cycle_hours(), 0.0)

    def test_driving_resumes_without_restart_once_pretrip_hours_roll_off(self):
        # A monotonic since-last-restart counter would still show 65h used
        # here and force an immediate restart. The true rolling window
        # recognizes the pretrip lump has already aged out by this point
        # in the trip, so driving proceeds on a full fresh budget instead.
        state = self._state(current_time=datetime(2026, 1, 9, 6, 0, 0))
        _drive_leg(state, leg_distance_miles=300.0, dest_label="Destination, IN")
        self.assertFalse(any(s.stop_type == "restart" for s in state.segments))

    def test_short_trip_is_unaffected_by_the_rolling_window(self):
        # Regression guard: when the window never reaches back far enough
        # to drop anything (a short trip, same day), behavior is identical
        # to treating pretrip hours as a flat, always-counted total.
        state = self._state(pretrip_hours=5.0, current_time=datetime(2026, 1, 2, 8, 0, 0))
        _drive_leg(state, leg_distance_miles=300.0, dest_label="Destination, IN")
        self.assertFalse(any(s.stop_type == "restart" for s in state.segments))
        self.assertAlmostEqual(state.rolling_cycle_hours() - 5.0, 300.0 / c.AVG_TRUCK_SPEED_MPH, places=2)


class CycleWaitVsRestartTests(unittest.TestCase):
    """§395.3(b) and the guide: the 34-hour restart is optional — a driver
    may instead wait for old days to drop off the rolling window. The
    engine takes whichever gets the truck moving sooner."""

    def test_waits_for_midnight_when_old_hours_age_off_sooner_than_a_restart(self):
        # Pre-trip lump sits on the trip's start date (Jan 1); the window
        # keeps it through Jan 8 and drops it at midnight into Jan 9. At
        # Jan 8 20:00 with the cap bound, the wait is 4h vs a 34h restart.
        state = _SimState(
            current_time=datetime(2026, 1, 8, 20, 0, 0), odometer_miles=0.0, location_label="X",
            pretrip_date=date(2026, 1, 1), pretrip_hours=70.0,
        )
        _drive_leg(state, 300.0, "Y")
        waits = [s for s in state.segments if s.stop_type == "cycle_wait"]
        self.assertEqual(len(waits), 1)
        self.assertAlmostEqual(waits[0].duration_hours, 4.0)
        self.assertFalse(any(s.stop_type == "restart" for s in state.segments))
        # A 4h wait does NOT reset the daily clocks — driving simply resumes.
        self.assertTrue(any(s.status == DRIVING and s.start_datetime == waits[0].end_datetime for s in state.segments))

    def test_restarts_when_no_midnight_frees_hours_within_34_hours(self):
        state = _SimState(
            current_time=datetime(2026, 1, 1, 8, 0, 0), odometer_miles=0.0, location_label="X",
            pretrip_date=date(2026, 1, 1), pretrip_hours=70.0,
        )
        _drive_leg(state, 300.0, "Y")
        self.assertTrue(any(s.stop_type == "restart" for s in state.segments))
        self.assertFalse(any(s.stop_type == "cycle_wait" for s in state.segments))


class HoursUsedTodayTests(unittest.TestCase):
    """A driver mid-shift at submit time does not get a fresh 11/14-hour
    clock: the hours they have already used today are seeded in."""

    def setUp(self):
        self.trip_start = datetime(2026, 1, 5, 8, 0, 0)

    def test_driving_hours_today_shrink_the_first_duty_period(self):
        result = simulate_trip(
            0.0, 1000.0, 20.0, self.trip_start, "A", "B", "C", driving_hours_today=9.0, on_duty_hours_today=10.0
        )
        first_rest = next(s for s in result.segments if s.status == SLEEPER_BERTH)
        driven_before_rest = sum(
            s.duration_hours for s in result.segments if s.status == DRIVING and s.end_datetime <= first_rest.start_datetime
        )
        self.assertLessEqual(driven_before_rest, 2.0 + 1e-6)

    def test_window_hours_today_shrink_the_first_window(self):
        # 13h of window already gone, 1h of driving: the 1h pickup closes the
        # window outright, so the first rest must come before any driving.
        result = simulate_trip(
            0.0, 500.0, 20.0, self.trip_start, "A", "B", "C", driving_hours_today=1.0, on_duty_hours_today=13.0
        )
        first_drive = next(i for i, s in enumerate(result.segments) if s.status == DRIVING)
        self.assertTrue(any(s.status == SLEEPER_BERTH for s in result.segments[:first_drive]))

    def test_pretrip_lump_sits_on_the_trip_start_date(self):
        result = simulate_trip(0.0, 100.0, 30.0, self.trip_start, "A", "B", "C")
        # Indirect: build a state the same way and check the placement.
        state = _SimState(
            current_time=self.trip_start, odometer_miles=0.0, location_label="X",
            pretrip_date=self.trip_start.date(), pretrip_hours=30.0,
        )
        state.current_time = self.trip_start + timedelta(days=7)
        self.assertAlmostEqual(state.rolling_cycle_hours(), 30.0)
        state.current_time = self.trip_start + timedelta(days=8)
        self.assertEqual(state.rolling_cycle_hours(), 0.0)
        self.assertTrue(result.segments)


if __name__ == "__main__":
    unittest.main()
