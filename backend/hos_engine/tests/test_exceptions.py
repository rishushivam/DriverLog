import unittest
from datetime import datetime

from .. import constants as c
from ..engine import simulate_trip
from ..exceptions import (
    annotate_logs,
    air_miles,
    duty_periods,
    evaluate_16_hour,
    evaluate_short_haul,
    max_air_miles_from,
)
from ..day_bucketing import build_daily_logs
from ..rules import short_haul_cdl_rules, short_haul_non_cdl_rules, standard_rules
from ..team_engine import simulate_team_trip
from ..types import DRIVING

T = datetime(2026, 1, 5, 6, 0, 0)
BASE = ("Base, OH", "Pickup, OH", "Drop, OH")


def _trip(leg1, leg2, leg3=0.0, rules=None, **kw):
    return simulate_trip(
        leg1, leg2, 10.0, T, *BASE, rules=rules,
        leg3_distance_miles=leg3, reporting_location_label="Base, OH" if leg3 else None, **kw,
    )


class ShortHaulRulesInEngineTests(unittest.TestCase):
    def test_cdl_short_haul_waives_the_30_minute_break(self):
        # 9h of driving on standard rules needs a break at hour 8.
        standard = _trip(0.0, 495.0, rules=standard_rules())
        self.assertTrue(any(s.stop_type == "break" for s in standard.segments))
        short = _trip(0.0, 495.0, rules=short_haul_cdl_rules())
        self.assertFalse(any(s.stop_type == "break" for s in short.segments))
        # ...but never the 11-hour driving limit: 12h of driving still rests.
        longer = _trip(0.0, 660.0, rules=short_haul_cdl_rules())
        self.assertTrue(any(s.stop_type == "rest" for s in longer.segments))

    def test_return_leg_ends_at_the_reporting_location(self):
        r = _trip(100.0, 100.0, leg3=100.0)
        self.assertEqual(r.segments[-1].stop_type, "return")
        self.assertEqual(r.segments[-1].location_label, "Base, OH")
        self.assertAlmostEqual(r.total_distance_miles, 300.0)

    def test_16_hour_exception_extends_one_window_only(self):
        # Pickup (1h) + 11h driving + dropoff would be 13h; with 2h of
        # on-duty time already used today the window binds at 14h on
        # standard rules and at 16h with the exception.
        standard = _trip(0.0, 605.0, rules=standard_rules(), on_duty_hours_today=2.0)
        extended = _trip(0.0, 605.0, rules=standard_rules(use_16_hour_exception=True), on_duty_hours_today=2.0)
        periods_std = duty_periods(standard.segments)
        periods_ext = duty_periods(extended.segments)
        self.assertGreater(len(periods_std), len(periods_ext))
        self.assertLessEqual(periods_ext[0].window_hours + 2.0, 16.0 + 1e-6)
        crossing = [s for s in extended.segments if s.remark and "16-hour short-haul exception" in s.remark]
        self.assertEqual(len(crossing), 1)
        self.assertEqual(crossing[0].status, DRIVING)

    def test_non_cdl_extension_is_limited_by_days_already_used(self):
        used_up = short_haul_non_cdl_rules(days_past_14th_hour_this_week=2)
        self.assertEqual(used_up.extended_window_days, 0)
        self.assertEqual(used_up.max_window_hours, 14.0)
        fresh = short_haul_non_cdl_rules(days_past_14th_hour_this_week=0)
        self.assertEqual(fresh.extended_window_days, 2)
        self.assertEqual(fresh.max_window_hours, 16.0)

    def test_team_engine_honours_rules_and_return_leg(self):
        truck, d1, d2 = simulate_team_trip(
            0.0, 495.0, 0.0, T, *BASE, rules=short_haul_cdl_rules(),
            leg3_distance_miles=50.0, reporting_location_label="Base, OH",
        )
        self.assertFalse(any(s.stop_type == "break" for s in truck.segments))
        self.assertEqual(truck.segments[-1].stop_type, "return")
        self.assertEqual(d1[-1].stop_type, "return")


class EligibilityTests(unittest.TestCase):
    def test_air_miles_conversion(self):
        # Columbus OH -> Cincinnati OH is ~100 statute miles ≈ 87 air-miles.
        d = air_miles([-82.9988, 39.9612], [-84.512, 39.1031])
        self.assertAlmostEqual(d, 87.0, delta=3.0)
        self.assertAlmostEqual(max_air_miles_from([0, 0], [[[0, 0], [0, 1]]]), 60.0, delta=0.2)

    def test_short_haul_day_within_limits_is_eligible(self):
        r = _trip(60.0, 60.0, leg3=60.0, rules=short_haul_cdl_rules())
        ev = evaluate_short_haul(r.segments, short_haul_cdl_rules(), farthest_air_miles=90.0, returns_to_reporting_location=True)
        self.assertTrue(ev.applied, ev.reasons)
        self.assertEqual(len(ev.periods), 1)

    def test_radius_or_release_failures_are_named(self):
        r = _trip(60.0, 60.0, leg3=60.0, rules=short_haul_cdl_rules())
        ev = evaluate_short_haul(r.segments, short_haul_cdl_rules(), farthest_air_miles=170.0, returns_to_reporting_location=True)
        self.assertFalse(ev.applied)
        self.assertTrue(any("150 air-mile" in x for x in ev.reasons))
        long_day = _trip(300.0, 300.0, leg3=100.0, rules=short_haul_cdl_rules())  # >11h driving -> 2 periods
        ev2 = evaluate_short_haul(long_day.segments, short_haul_cdl_rules(), 50.0, True)
        self.assertFalse(ev2.applied)
        self.assertTrue(any("duty periods" in x for x in ev2.reasons))

    def test_non_cdl_may_use_the_16th_hour(self):
        # 3h already on duty + 1h pickup + 11h driving = driving ends at the
        # 15th hour: past the 14th, inside the 16th, so one extension used.
        rules = short_haul_non_cdl_rules(0)
        r = _trip(0.0, 605.0, leg3=0.0, rules=rules, on_duty_hours_today=3.0)
        ev = evaluate_short_haul(r.segments, rules, 50.0, True, window_offset_hours=3.0)
        self.assertTrue(ev.applied, ev.reasons)
        self.assertEqual(ev.extended_period_index, 0)
        self.assertGreater(ev.periods[0].window_hours, 14.0)

    def test_16_hour_evaluation_reports_use(self):
        rules = standard_rules(use_16_hour_exception=True)
        r = _trip(0.0, 605.0, leg3=10.0, rules=rules, on_duty_hours_today=2.0)
        ev = evaluate_16_hour(r.segments, rules, returns_to_reporting_location=True, window_offset_hours=2.0)
        self.assertTrue(ev.applied)
        logs = annotate_logs([l.to_dict() for l in build_daily_logs(r.segments)], ev, rules)
        self.assertEqual(logs[0]["record_type"], "rods")
        self.assertTrue(any("16-hour short-haul exception" in n for n in logs[0]["exception_notes"]))

    def test_short_haul_logs_become_time_records(self):
        rules = short_haul_cdl_rules()
        r = _trip(60.0, 60.0, leg3=60.0, rules=rules)
        ev = evaluate_short_haul(r.segments, rules, 90.0, True)
        logs = annotate_logs([l.to_dict() for l in build_daily_logs(r.segments)], ev, rules)
        self.assertEqual(logs[0]["record_type"], "time_record")
        tr = logs[0]["time_record"]
        self.assertEqual(tr["report_time"], "06:00")
        self.assertAlmostEqual(tr["on_duty_hours"], 180 / c.AVG_TRUCK_SPEED_MPH + 2.0 + c.RETURN_CHECKIN_HOURS, places=2)


if __name__ == "__main__":
    unittest.main()
