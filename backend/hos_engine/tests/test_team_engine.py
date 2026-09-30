import unittest
from datetime import datetime

from .. import constants as c
from ..day_bucketing import build_daily_logs
from ..team_engine import simulate_team_trip
from ..types import DRIVING, SLEEPER_BERTH


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


if __name__ == "__main__":
    unittest.main()
