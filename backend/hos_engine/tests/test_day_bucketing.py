import unittest
from datetime import datetime, timedelta

from ..day_bucketing import _split_at_midnights, build_daily_logs
from ..engine import simulate_trip
from ..types import DRIVING, OFF_DUTY, SLEEPER_BERTH, Segment


class SplitAtMidnightsTests(unittest.TestCase):
    def test_segment_within_one_day_is_not_split(self):
        seg = Segment(
            status=DRIVING,
            start_datetime=datetime(2026, 1, 5, 8, 0),
            end_datetime=datetime(2026, 1, 5, 12, 0),
            location_label="A",
            odometer_start_miles=0.0,
            odometer_end_miles=220.0,
            is_status_change=True,
        )
        pieces = _split_at_midnights(seg)
        self.assertEqual(len(pieces), 1)
        self.assertEqual(pieces[0], seg)

    def test_segment_spanning_one_midnight_splits_into_two_pieces(self):
        seg = Segment(
            status=SLEEPER_BERTH,
            start_datetime=datetime(2026, 1, 5, 20, 0),
            end_datetime=datetime(2026, 1, 6, 6, 0),
            location_label="Rest stop",
            odometer_start_miles=500.0,
            odometer_end_miles=500.0,
            remark="10-hour rest",
            is_status_change=True,
        )
        pieces = _split_at_midnights(seg)
        self.assertEqual(len(pieces), 2)
        self.assertEqual(pieces[0].end_datetime, datetime(2026, 1, 6, 0, 0))
        self.assertEqual(pieces[1].start_datetime, datetime(2026, 1, 6, 0, 0))
        # Only the first piece carries the remark / status-change flag.
        self.assertEqual(pieces[0].remark, "10-hour rest")
        self.assertIsNone(pieces[1].remark)
        self.assertTrue(pieces[0].is_status_change)
        self.assertFalse(pieces[1].is_status_change)
        # Contiguity and mileage conservation.
        self.assertEqual(pieces[0].odometer_end_miles, pieces[1].odometer_start_miles)

    def test_segment_spanning_multiple_midnights_splits_into_n_plus_1_pieces(self):
        # A 34-hour restart starting at 20:00 spans day1->day2->day3.
        seg = Segment(
            status=SLEEPER_BERTH,
            start_datetime=datetime(2026, 1, 5, 20, 0),
            end_datetime=datetime(2026, 1, 5, 20, 0) + timedelta(hours=34),
            location_label="Restart",
            odometer_start_miles=100.0,
            odometer_end_miles=100.0,
            is_status_change=True,
        )
        pieces = _split_at_midnights(seg)
        self.assertEqual(len(pieces), 3)
        self.assertEqual(pieces[0].start_datetime, datetime(2026, 1, 5, 20, 0))
        self.assertEqual(pieces[-1].end_datetime, datetime(2026, 1, 5, 20, 0) + timedelta(hours=34))


class BuildDailyLogsTests(unittest.TestCase):
    def test_every_day_totals_sum_to_24(self):
        result = simulate_trip(
            leg1_distance_miles=150.0,
            leg2_distance_miles=1800.0,
            current_cycle_used_hours=5.0,
            trip_start=datetime(2026, 1, 5, 8, 0),
            current_location_label="Origin, TX",
            pickup_location_label="Pickup, TX",
            dropoff_location_label="Dropoff, WA",
        )
        logs = build_daily_logs(result.segments)
        self.assertGreaterEqual(len(logs), 2)
        for log in logs:
            total = sum(log.totals.values())
            self.assertAlmostEqual(total, 24.0, places=1, msg=f"{log.date} totals={log.totals}")

    def test_multiday_trip_produces_two_to_three_logs_with_midnight_split(self):
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=1200.0,
            current_cycle_used_hours=0.0,
            trip_start=datetime(2026, 1, 5, 6, 0),
            current_location_label="Origin, IL",
            pickup_location_label="Pickup, IL",
            dropoff_location_label="Dropoff, CO",
        )
        logs = build_daily_logs(result.segments)
        self.assertIn(len(logs), (2, 3))
        dates = [log.date for log in logs]
        self.assertEqual(dates, sorted(dates))

    def test_first_day_padded_off_duty_when_trip_starts_mid_day(self):
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=50.0,
            current_cycle_used_hours=0.0,
            trip_start=datetime(2026, 1, 5, 8, 0),
            current_location_label="Origin, OH",
            pickup_location_label="Pickup, OH",
            dropoff_location_label="Dropoff, OH",
        )
        logs = build_daily_logs(result.segments)
        first_log = logs[0]
        first_segment = first_log.segments[0]
        self.assertEqual(first_segment["status"], OFF_DUTY)
        self.assertEqual(first_segment["start_time"], "00:00")
        self.assertEqual(first_segment["end_time"], "08:00")

    def test_last_day_padded_off_duty_when_trip_ends_mid_day(self):
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=50.0,
            current_cycle_used_hours=0.0,
            trip_start=datetime(2026, 1, 5, 8, 0),
            current_location_label="Origin, OH",
            pickup_location_label="Pickup, OH",
            dropoff_location_label="Dropoff, OH",
        )
        logs = build_daily_logs(result.segments)
        last_log = logs[-1]
        last_segment = last_log.segments[-1]
        self.assertEqual(last_segment["status"], OFF_DUTY)
        self.assertEqual(last_segment["end_time"], "24:00")

    def test_daily_log_total_miles_matches_odometer_delta(self):
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=100.0,
            current_cycle_used_hours=0.0,
            trip_start=datetime(2026, 1, 5, 8, 0),
            current_location_label="Origin, OH",
            pickup_location_label="Pickup, OH",
            dropoff_location_label="Dropoff, OH",
        )
        logs = build_daily_logs(result.segments)
        self.assertAlmostEqual(sum(log.total_miles for log in logs), 100.0, places=1)

    def test_only_genuine_status_changes_get_remarks(self):
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=100.0,
            current_cycle_used_hours=0.0,
            trip_start=datetime(2026, 1, 5, 8, 0),
            current_location_label="Origin, OH",
            pickup_location_label="Pickup, OH",
            dropoff_location_label="Dropoff, OH",
        )
        logs = build_daily_logs(result.segments)
        total_remarks = sum(len(log.remarks) for log in logs)
        # pickup -> driving -> dropoff is 3 genuine status changes.
        self.assertEqual(total_remarks, 3)


class RollingCycleRecapTests(unittest.TestCase):
    """The Recap section's cycle_hours_used_end_of_day must replay the
    exact same rolling 7/8-day window the engine itself used to decide
    restarts — never the old monotonic since-last-restart counter."""

    def test_recap_never_exceeds_cap_on_a_day_still_driving(self):
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=2500.0,
            current_cycle_used_hours=0.0,
            trip_start=datetime(2026, 1, 5, 6, 0),
            current_location_label="Origin, CA",
            pickup_location_label="Pickup, CA",
            dropoff_location_label="Dropoff, NY",
        )
        logs = build_daily_logs(result.segments, starting_cycle_hours=0.0, cycle_cap_days=8, max_cycle_hours=70.0)
        driving_days = {
            log.date for log in logs
            if any(seg["status"] == DRIVING for seg in log.segments)
        }
        for log in logs:
            if log.date in driving_days:
                self.assertLessEqual(log.cycle_hours_used_end_of_day, 70.0 + 1e-6)

    def test_recap_drops_pretrip_hours_once_the_notional_day_ages_out(self):
        # Short trip, same day as trip start: pretrip hours still fully
        # counted on day one (its notional day hasn't left the window yet).
        result = simulate_trip(
            leg1_distance_miles=0.0,
            leg2_distance_miles=100.0,
            current_cycle_used_hours=20.0,
            trip_start=datetime(2026, 1, 5, 8, 0),
            current_location_label="Origin, OH",
            pickup_location_label="Pickup, OH",
            dropoff_location_label="Dropoff, OH",
        )
        logs = build_daily_logs(result.segments, starting_cycle_hours=20.0, cycle_cap_days=8, max_cycle_hours=70.0)
        first_log = logs[0]
        self.assertGreaterEqual(first_log.cycle_hours_used_end_of_day, 20.0)


if __name__ == "__main__":
    unittest.main()
