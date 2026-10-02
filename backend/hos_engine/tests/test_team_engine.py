import unittest
from datetime import date, datetime, timedelta

from .. import constants as c
from ..day_bucketing import build_daily_logs
from ..team_engine import _DriverClock, _TruckState, _drive_leg_team, _insert_solo_style_reset, simulate_team_trip
from ..types import DRIVING, OFF_DUTY, SLEEPER_BERTH


def _duty_periods(segments):
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


class TeamEngineTests(unittest.TestCase):
    def setUp(self):
        self.trip_start = datetime(2026, 1, 5, 8, 0, 0)

    def test_truck_keeps_moving_through_what_would_be_a_solo_reset(self):
        # 1400 miles needs > 11 hours of driving for one person, which
        # would force a 10-hour solo reset. With a rested partner, the
        # truck should never need to stop for a full reset — only brief
        # breaks/fuel stops.
        truck_result, driver_1_segs, driver_2_segs = simulate_team_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=1400.0,
            current_cycle_used_hours=0.0,
            trip_start=self.trip_start,
            current_location_label="Origin, IL",
            pickup_location_label="Pickup, IL",
            dropoff_location_label="Dropoff, CA",
        )
        long_stops = [
            s for s in truck_result.segments if s.status == SLEEPER_BERTH and s.duration_hours >= c.MIN_OFF_DUTY_RESET_HOURS
        ]
        self.assertEqual(len(long_stops), 0, "team truck should not need a full 10-hour reset for this distance")
        self.assertTrue(any(s.driver == "driver_2" and s.status == DRIVING for s in driver_2_segs))

    def test_each_driver_never_exceeds_11_hours_driving_between_their_own_resets(self):
        _, driver_1_segs, driver_2_segs = simulate_team_trip(
            leg1_distance_miles=150.0,
            leg2_distance_miles=1800.0,
            current_cycle_used_hours=5.0,
            trip_start=self.trip_start,
            current_location_label="Origin, TX",
            pickup_location_label="Pickup, TX",
            dropoff_location_label="Dropoff, WA",
        )
        for segs in (driver_1_segs, driver_2_segs):
            for period_start, period_segs in _duty_periods(segs):
                driving_hours = sum(s.duration_hours for s in period_segs if s.status == DRIVING)
                self.assertLessEqual(driving_hours, c.MAX_DRIVING_HOURS_PER_PERIOD + 1e-6)

    def test_resting_driver_odometer_never_advances(self):
        _, driver_1_segs, _driver_2_segs = simulate_team_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=500.0,
            current_cycle_used_hours=0.0,
            trip_start=self.trip_start,
            current_location_label="Origin, IL",
            pickup_location_label="Pickup, IL",
            dropoff_location_label="Dropoff, IN",
        )
        for seg in driver_1_segs:
            if seg.status != DRIVING:
                self.assertAlmostEqual(seg.odometer_start_miles, seg.odometer_end_miles, places=6)

    def test_personal_daily_logs_still_sum_to_24_hours(self):
        _, driver_1_segs, driver_2_segs = simulate_team_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=1800.0,
            current_cycle_used_hours=10.0,
            trip_start=self.trip_start,
            current_location_label="Origin, IL",
            pickup_location_label="Pickup, IL",
            dropoff_location_label="Dropoff, CA",
        )
        for segs in (driver_1_segs, driver_2_segs):
            logs = build_daily_logs(segs, starting_cycle_hours=10.0)
            self.assertGreaterEqual(len(logs), 1)
            for log in logs:
                self.assertAlmostEqual(sum(log.totals.values()), 24.0, places=1)

    def test_both_drivers_capped_forces_one_shared_restart(self):
        truck_result, driver_1_segs, driver_2_segs = simulate_team_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=600.0,
            current_cycle_used_hours=68.0,  # both start with only 2 hrs of cycle room
            trip_start=self.trip_start,
            current_location_label="Origin, IL",
            pickup_location_label="Pickup, IL",
            dropoff_location_label="Dropoff, IN",
        )
        restarts = [s for s in truck_result.segments if s.stop_type == "restart"]
        self.assertEqual(len(restarts), 1)
        self.assertAlmostEqual(restarts[0].duration_hours, c.RESTART_DURATION_HOURS)
        # Both drivers should show a restart-tagged segment on their own log.
        self.assertTrue(any(s.stop_type == "restart" for s in driver_1_segs))
        self.assertTrue(any(s.stop_type == "restart" for s in driver_2_segs))

    def test_custom_restart_hours_overrides_the_34_hour_default(self):
        truck_result, _, _ = simulate_team_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=600.0,
            current_cycle_used_hours=68.0,
            trip_start=self.trip_start,
            current_location_label="Origin, IL",
            pickup_location_label="Pickup, IL",
            dropoff_location_label="Dropoff, IN",
            restart_hours=12.0,
        )
        restarts = [s for s in truck_result.segments if s.stop_type == "restart"]
        self.assertEqual(len(restarts), 1)
        self.assertAlmostEqual(restarts[0].duration_hours, 12.0)

    def test_total_distance_matches_sum_of_leg_distances(self):
        truck_result, _, _ = simulate_team_trip(
            leg1_distance_miles=200.0,
            leg2_distance_miles=900.0,
            current_cycle_used_hours=0.0,
            trip_start=self.trip_start,
            current_location_label="Origin, IL",
            pickup_location_label="Pickup, IL",
            dropoff_location_label="Dropoff, TX",
        )
        self.assertAlmostEqual(truck_result.total_distance_miles, 1100.0)
        driving_miles = sum(s.odometer_end_miles - s.odometer_start_miles for s in truck_result.segments if s.status == DRIVING)
        self.assertAlmostEqual(driving_miles, 1100.0, places=1)


class SoloFallbackResetTests(unittest.TestCase):
    """The solo-style fallback (`_insert_solo_style_reset`, used when the
    partner is unavailable — already capped) is a plain 10-hour reset, never
    a §395.1(g) split, and a short what-if restart never clears daily clocks."""

    def setUp(self):
        self.trip_start = datetime(2026, 1, 5, 8, 0, 0)
        self.truck = _TruckState(current_time=self.trip_start, odometer_miles=0.0, location_label="Origin, IL")

    def _clock(self, driver_id, **overrides):
        defaults = dict(
            driver_id=driver_id,
            max_cycle_hours=70.0,
            pretrip_date=self.trip_start.date() - timedelta(days=1),
            pretrip_hours=0.0,
        )
        defaults.update(overrides)
        return _DriverClock(**defaults)

    def test_daily_reset_is_one_plain_10_hour_block(self):
        active = self._clock("driver_1", driving_hrs_in_duty_period=11.0, window_hrs_elapsed=12.0)
        resting = self._clock("driver_2", is_capped=True)
        _insert_solo_style_reset(self.truck, active, resting, "En route", is_restart=False)
        rests = [s for s in active.segments if s.status == SLEEPER_BERTH]
        self.assertEqual(len(rests), 1)
        self.assertEqual(rests[0].stop_type, "rest")
        self.assertAlmostEqual(rests[0].duration_hours, c.MIN_OFF_DUTY_RESET_HOURS)
        self.assertEqual(active.driving_hrs_in_duty_period, 0.0)
        self.assertEqual(active.window_hrs_elapsed, 0.0)

    def test_restart_takes_full_34_hours_and_clears_everything(self):
        active = self._clock("driver_1", pretrip_hours=70.0, driving_hrs_in_duty_period=5.0)
        resting = self._clock("driver_2", is_capped=True)
        _insert_solo_style_reset(self.truck, active, resting, "En route", is_restart=True)
        restart_segs = [s for s in active.segments if s.stop_type == "restart"]
        self.assertEqual(len(restart_segs), 1)
        self.assertAlmostEqual(restart_segs[0].duration_hours, 34.0)
        self.assertEqual(active.rolling_cycle_hours(self.truck.current_time), 0.0)
        self.assertEqual(active.driving_hrs_in_duty_period, 0.0)

    def test_short_what_if_restart_does_not_reset_daily_clocks(self):
        active = self._clock("driver_1", pretrip_hours=70.0, restart_hours=5.0, driving_hrs_in_duty_period=9.0)
        resting = self._clock("driver_2", is_capped=True)
        _insert_solo_style_reset(self.truck, active, resting, "En route", is_restart=True)
        self.assertEqual(active.rolling_cycle_hours(self.truck.current_time), 0.0)
        self.assertEqual(active.driving_hrs_in_duty_period, 9.0)


class TeamCycleCapOnDutyTests(unittest.TestCase):
    def setUp(self):
        self.trip_start = datetime(2026, 1, 5, 8, 0, 0)

    def test_final_dropoff_past_both_caps_does_not_force_a_restart(self):
        truck_result, _, _ = simulate_team_trip(
            0.0, 10.0, 69.5, self.trip_start, "A", "B", "C", driver_2_cycle_used_hours=69.5
        )
        self.assertFalse(any(s.stop_type == "restart" for s in truck_result.segments))
        self.assertLess(truck_result.total_trip_span_hours, 3.0)


class TeamRollingCycleWindowTests(unittest.TestCase):
    """Per-driver equivalent of test_engine.py's RollingCycleWindowTests —
    each driver's own 60/70-hour cap is a true rolling 7/8-day window too,
    not a since-last-restart counter."""

    def setUp(self):
        self.pretrip_date = date(2026, 1, 1)

    def _clock(self, driver_id, **overrides):
        defaults = dict(
            driver_id=driver_id,
            max_cycle_hours=70.0,
            pretrip_date=self.pretrip_date,
            pretrip_hours=65.0,
            cycle_cap_days=8,
        )
        defaults.update(overrides)
        return _DriverClock(**defaults)

    def test_pretrip_lump_counts_while_its_day_is_still_in_the_window(self):
        active = self._clock("driver_1")
        self.assertAlmostEqual(active.rolling_cycle_hours(datetime(2026, 1, 8, 23, 0, 0)), 65.0)

    def test_pretrip_lump_ages_out_once_its_day_leaves_the_window(self):
        active = self._clock("driver_1")
        self.assertEqual(active.rolling_cycle_hours(datetime(2026, 1, 9, 0, 0, 0)), 0.0)

    def test_driving_resumes_without_restart_once_pretrip_hours_roll_off(self):
        truck = _TruckState(
            current_time=datetime(2026, 1, 9, 6, 0, 0), odometer_miles=0.0, location_label="Origin, IL"
        )
        active = self._clock("driver_1")
        resting = self._clock("driver_2", is_capped=True)  # unavailable -> isolates active's own cap behavior
        _drive_leg_team(truck, active, resting, 300.0, "Destination, IN")
        self.assertFalse(any(s.stop_type == "restart" for s in active.segments))


class TeamRestingDriverLogTests(unittest.TestCase):
    def setUp(self):
        self.trip_start = datetime(2026, 1, 5, 8, 0, 0)

    def test_resting_driver_logs_7h_berth_then_3h_passenger_seat_then_berth(self):
        _, _, driver_2_segs = simulate_team_trip(0.0, 700.0, 0.0, self.trip_start, "A", "B", "C")
        # Driver 1 drives ~12.7h straight (8h + break + 4.7h); driver 2's
        # sheet for that stint must read SB 7h, OFF 3h, then SB again.
        statuses = []
        for seg in driver_2_segs:
            if seg.status == DRIVING:
                break
            if statuses and statuses[-1][0] == seg.status:
                statuses[-1][1] += seg.duration_hours
            else:
                statuses.append([seg.status, seg.duration_hours])
        self.assertEqual([st for st, _ in statuses[:3]], [SLEEPER_BERTH, OFF_DUTY, SLEEPER_BERTH])
        self.assertAlmostEqual(statuses[0][1], 7.0)
        self.assertAlmostEqual(statuses[1][1], 3.0)
        passenger = [s for s in driver_2_segs if s.status == OFF_DUTY]
        self.assertTrue(all(s.remark == "Passenger seat (off duty)" for s in passenger))

    def test_resting_partner_gets_their_own_wording_on_a_solo_style_rest(self):
        _, _, driver_2_segs = simulate_team_trip(
            0.0, 1500.0, 0.0, self.trip_start, "A", "B", "C", driver_2_cycle_used_hours=70.0
        )
        rests = [s for s in driver_2_segs if s.stop_type == "rest" and s.duration_hours >= 10]
        self.assertTrue(rests)
        for s in rests:
            self.assertIn("co-driver", s.remark)

    def test_driver_entered_at_the_cap_recovers_34_hours_after_trip_start(self):
        _, _, driver_2_segs = simulate_team_trip(
            0.0, 2000.0, 0.0, self.trip_start, "A", "B", "C", driver_2_cycle_used_hours=70.0
        )
        first_drive = next(s for s in driver_2_segs if s.status == DRIVING)
        hours_in = (first_drive.start_datetime - self.trip_start).total_seconds() / 3600.0
        self.assertGreaterEqual(hours_in, 34.0 - 1e-6)
        # The printed recap must agree: 34 consecutive hours off cleared
        # the 70 pre-trip hours even though no "restart" stop was logged.
        logs = build_daily_logs(driver_2_segs, starting_cycle_hours=70.0)
        self.assertLess(logs[-1].cycle_hours_used_end_of_day, 70.0)
        # ...and not much later than that: previously the recovery clock
        # only started when they were first asked to drive.
        self.assertLess(hours_in, 34.0 + 14.0)


if __name__ == "__main__":
    unittest.main()
