from django.db import models

CYCLE_SCHEDULE_CHOICES = [("70/8", "70-hour / 8-day"), ("60/7", "60-hour / 7-day"), ("custom", "Custom")]
OPERATING_MODE_CHOICES = [
    ("standard", "Standard (§395.3)"),
    ("short_haul_cdl", "CDL short-haul (§395.1(e)(1))"),
    ("short_haul_non_cdl", "Non-CDL short-haul (§395.1(e)(2))"),
]


class Trip(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)

    current_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    current_cycle_used_hours = models.FloatField()
    # A carrier assigns one schedule or the other, never both (§395.3(b)) —
    # this picks which cap the engine enforces (70 vs 60) and which half of
    # the printed log's Recap section gets filled in.
    cycle_schedule = models.CharField(max_length=10, choices=CYCLE_SCHEDULE_CHOICES, default="70/8")
    # The actual cap the engine enforced — 70 or 60 for a named schedule, or
    # the driver-supplied value when cycle_schedule is "custom". Stored
    # directly (rather than re-derived from cycle_schedule) so the frontend
    # never has to know which schedules are "named" vs "custom" to compute
    # cycle-hours-available-tomorrow.
    cycle_cap_hours = models.FloatField(default=70.0)
    # The rolling-window day count that names the schedule (8 for 70/8, 7
    # for 60/7, or the driver-supplied value for "custom"). Display-only —
    # no calculation in this app currently keys off it — but a schedule is
    # a two-number name ("70-hour / 8-day"), so a custom one needs both
    # numbers, not just the hour cap standing in alone.
    cycle_cap_days = models.PositiveSmallIntegerField(default=8)
    # 2 = real team-driving simulation (two independent HOS clocks,
    # alternating who's behind the wheel) — not just a label.
    num_drivers = models.PositiveSmallIntegerField(default=1)
    co_driver_name = models.CharField(max_length=255, blank=True, default="")
    # Driver 2's own starting cycle-hours reading. Null for a solo trip, or
    # for an older team trip saved before this field existed — defaults to
    # `current_cycle_used_hours` at simulation time in that case, but two
    # real people essentially never share the exact same number, so a
    # dispatcher who knows both should be able to enter both.
    co_driver_current_cycle_used_hours = models.FloatField(null=True, blank=True)
    # 49 CFR §395.3(c)'s restart is fixed at 34 consecutive hours off duty;
    # exposed as an input anyway so the tool can be used to explore "what
    # if" scenarios against a different reset length, not because the real
    # rule is negotiable.
    restart_hours = models.FloatField(default=34.0)
    # The driver's current duty period at trip start: hours already driven,
    # and hours since the 14-hour window opened (both since their last
    # 10-hour rest). 0/0 = a fresh clock, the old assumption.
    driving_hours_today = models.FloatField(default=0.0)
    on_duty_hours_today = models.FloatField(default=0.0)

    # Short-haul / 16-hour exceptions (§395.1(e), §395.1(o)). The mode the
    # dispatcher asked for; whether the finished plan actually qualified is
    # `exception_applied`, with `exception_reasons` naming each failed test
    # when it did not (the plan then ran under standard rules instead).
    operating_mode = models.CharField(max_length=24, choices=OPERATING_MODE_CHOICES, default="standard")
    work_reporting_location = models.CharField(max_length=255, blank=True, default="")
    work_reporting_coords = models.JSONField(default=list, blank=True)  # [lng, lat]
    return_to_reporting_location = models.BooleanField(default=False)
    use_16_hour_exception = models.BooleanField(default=False)
    days_past_14th_hour_this_week = models.PositiveSmallIntegerField(default=0)
    exception_applied = models.BooleanField(default=False)
    exception_reasons = models.JSONField(default=list, blank=True)
    farthest_air_miles = models.FloatField(null=True, blank=True)

    current_location_coords = models.JSONField(default=list, blank=True)  # [lng, lat]
    pickup_location_coords = models.JSONField(default=list, blank=True)
    dropoff_location_coords = models.JSONField(default=list, blank=True)

    total_distance_miles = models.FloatField(null=True, blank=True)
    # Raw distance / AVG_TRUCK_SPEED_MPH estimate — driving time only.
    total_duration_hours = models.FloatField(null=True, blank=True)
    # The real answer to "how long does this trip take" — wall-clock span
    # including every break/rest/restart. Can be much larger than
    # total_duration_hours above; that gap is expected, not a bug.
    total_trip_span_hours = models.FloatField(null=True, blank=True)
    route_geometry = models.JSONField(null=True, blank=True)  # {"to_pickup": [...], "to_dropoff": [...], "to_reporting": [...]|None}
    stops = models.JSONField(default=list, blank=True)  # map markers: pickup/dropoff/fuel/break/rest/restart

    segments = models.JSONField(default=list, blank=True)  # full flat list, kept for audit — not in the API response
    daily_logs = models.JSONField(default=list, blank=True)  # this IS the API's `logs` (driver 1's personal log)
    # Driver 2's own personal daily logs — empty for solo trips. Team
    # driving never merges two people's hours onto one sheet; this is a
    # genuinely separate log, not a display variant of the first one.
    co_driver_daily_logs = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Trip #{self.pk}: {self.current_location} -> {self.pickup_location} -> {self.dropoff_location}"
