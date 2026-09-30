import unittest
from datetime import datetime

from .. import constants as c
from ..engine import simulate_trip
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


if __name__ == "__main__":
    unittest.main()
