from rest_framework import serializers

from hos_engine.constants import (
    CYCLE_SCHEDULE_DAYS,
    CYCLE_SCHEDULES,
    DEFAULT_CYCLE_SCHEDULE,
    NON_CDL_EXTENDED_DAYS_PER_WEEK,
    RESTART_DURATION_HOURS,
)
from hos_engine.rules import OPERATING_MODES, SHORT_HAUL_NON_CDL, STANDARD

from .models import Trip


class TripRequestSerializer(serializers.Serializer):
    current_location = serializers.CharField(max_length=255, allow_blank=False)
    pickup_location = serializers.CharField(max_length=255, allow_blank=False)
    dropoff_location = serializers.CharField(max_length=255, allow_blank=False)
    # Upper bound is checked against the chosen schedule's own cap in
    # validate() below (60 for "60/7", or the custom cap) — 168 here is just
    # an outer sanity fence, not the real limit.
    current_cycle_used_hours = serializers.FloatField(min_value=0.0, max_value=168.0)
    # Which cap the engine enforces (70, 60, or a driver-supplied custom
    # value) and which block of the printed log's Recap section gets filled
    # in — a carrier assigns one schedule at a time, never both (§395.3(b)).
    cycle_schedule = serializers.ChoiceField(
        choices=list(CYCLE_SCHEDULES.keys()) + ["custom"], default=DEFAULT_CYCLE_SCHEDULE
    )
    # Required (and only meaningful) when cycle_schedule == "custom" — a
    # schedule is really two numbers ("70-hour / 8-day"), so a custom one
    # needs its own day count too, not just the hour cap standing in alone.
    custom_cycle_hours = serializers.FloatField(min_value=1.0, max_value=168.0, required=False, allow_null=True, default=None)
    custom_cycle_days = serializers.IntegerField(min_value=1, max_value=30, required=False, allow_null=True, default=None)
    # 2 = real team-driving simulation (see hos_engine/team_engine.py), not
    # just a label.
    num_drivers = serializers.ChoiceField(choices=[1, 2], default=1)
    co_driver_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    # Driver 2's own starting cycle-hours reading — only meaningful when
    # num_drivers == 2. Optional: falls back to current_cycle_used_hours
    # (the old shared-value behavior) when the caller doesn't supply one,
    # rather than forcing every existing integration to start passing it.
    co_driver_current_cycle_used_hours = serializers.FloatField(
        min_value=0.0, max_value=168.0, required=False, allow_null=True, default=None
    )
    # 49 CFR §395.3(c)'s restart is fixed at 34 consecutive hours off duty —
    # exposed as an input anyway so the tool can explore "what if the reset
    # were shorter/longer" scenarios, not because the real rule is
    # negotiable. Default stays the actual regulatory value. Floor of 10:
    # anything shorter can't even clear the daily 11/14-hour clocks
    # (§395.3(a)(1)), so a "restart" below that would produce a log no
    # inspector would accept.
    restart_hours = serializers.FloatField(min_value=10.0, max_value=168.0, default=RESTART_DURATION_HOURS)
    # The driver's own local wall-clock reading at submit time (naive,
    # "YYYY-MM-DDTHH:MM:SS"), supplied by the browser. Optional so direct
    # API callers (tests, curl) keep working without it; the view falls
    # back to the server's own clock when it's absent, which is only ever
    # correct by coincidence when the server and the driver share a
    # timezone.
    # Hours already used in the driver's CURRENT duty period at submit time
    # (since their last 10-hour rest): driven, and total since the 14-hour
    # window opened. Default 0 = fresh clock. Assumed to already be part of
    # current_cycle_used_hours.
    driving_hours_today = serializers.FloatField(min_value=0.0, max_value=11.0, required=False, default=0.0)
    on_duty_hours_today = serializers.FloatField(min_value=0.0, max_value=14.0, required=False, default=0.0)
    client_local_time = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)

    # Short-haul (§395.1(e)) and 16-hour (§395.1(o)) exceptions. All of
    # them require the driver to return to the work reporting location, so
    # choosing one normally adds a return leg from the dropoff back to it.
    operating_mode = serializers.ChoiceField(choices=list(OPERATING_MODES), default=STANDARD)
    # Defaults to the current location when blank.
    work_reporting_location = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    return_to_reporting_location = serializers.BooleanField(required=False, default=False)
    use_16_hour_exception = serializers.BooleanField(required=False, default=False)
    # §395.1(o) conditions the tool cannot verify; the dispatcher attests.
    sixteen_hour_attestation = serializers.BooleanField(required=False, default=False)
    # §395.1(e)(2): days in the current 7 already driven past the 14th hour.
    days_past_14th_hour_this_week = serializers.IntegerField(
        min_value=0, max_value=NON_CDL_EXTENDED_DAYS_PER_WEEK, required=False, default=0
    )

    def validate(self, data):
        if data.get("use_16_hour_exception"):
            if data["operating_mode"] != STANDARD:
                raise serializers.ValidationError(
                    {"use_16_hour_exception": ["The 16-hour exception applies to standard operation only, not to short-haul."]}
                )
            if not data.get("sixteen_hour_attestation"):
                raise serializers.ValidationError(
                    {"sixteen_hour_attestation": [
                        "Confirm the driver returned to the work reporting location on the last 5 duty tours and has not used the 16-hour exception in the past 7 days."
                    ]}
                )
            if not data.get("return_to_reporting_location"):
                raise serializers.ValidationError(
                    {"return_to_reporting_location": ["The 16-hour exception requires returning to the work reporting location that day."]}
                )
        if data["operating_mode"] != STANDARD and not data.get("return_to_reporting_location"):
            raise serializers.ValidationError(
                {"return_to_reporting_location": ["Short-haul requires returning to the work reporting location the same day."]}
            )
        if data["operating_mode"] != SHORT_HAUL_NON_CDL:
            data["days_past_14th_hour_this_week"] = 0
        if data["cycle_schedule"] == "custom":
            errors = {}
            if data.get("custom_cycle_hours") is None:
                errors["custom_cycle_hours"] = ["Required when cycle_schedule is 'custom'."]
            if data.get("custom_cycle_days") is None:
                errors["custom_cycle_days"] = ["Required when cycle_schedule is 'custom'."]
            if errors:
                raise serializers.ValidationError(errors)
        cap = resolve_cycle_cap_hours(data["cycle_schedule"], data.get("custom_cycle_hours"))
        if data["current_cycle_used_hours"] > cap:
            raise serializers.ValidationError(
                {"current_cycle_used_hours": [f"Must be {cap:.0f} or less for this schedule."]}
            )
        if data.get("driving_hours_today", 0.0) > data.get("on_duty_hours_today", 0.0) + 1e-6:
            raise serializers.ValidationError(
                {"driving_hours_today": ["Cannot exceed on-duty hours today (driving is on-duty time)."]}
            )
        if data.get("on_duty_hours_today", 0.0) > data["current_cycle_used_hours"] + 1e-6:
            raise serializers.ValidationError(
                {"on_duty_hours_today": ["Cannot exceed current cycle used hours (today's hours are part of the cycle)."]}
            )
        co_driver_hours = data.get("co_driver_current_cycle_used_hours")
        if co_driver_hours is not None and co_driver_hours > cap:
            raise serializers.ValidationError(
                {"co_driver_current_cycle_used_hours": [f"Must be {cap:.0f} or less for this schedule."]}
            )
        return data


def resolve_cycle_cap_hours(cycle_schedule: str, custom_cycle_hours) -> float:
    """The cap the engine actually enforces — 70/60 for a named schedule, or
    the driver-supplied value for "custom". Shared by validate() above and
    the view, so there's exactly one place that knows how to read this."""
    if cycle_schedule == "custom":
        return custom_cycle_hours
    return CYCLE_SCHEDULES[cycle_schedule]


def resolve_cycle_cap_days(cycle_schedule: str, custom_cycle_days) -> int:
    """The day count that names the schedule — 8/7 for a named schedule, or
    the driver-supplied value for "custom". Display-only (see Trip.cycle_
    cap_days), but a schedule name is two numbers, not one."""
    if cycle_schedule == "custom":
        return custom_cycle_days
    return CYCLE_SCHEDULE_DAYS[cycle_schedule]


class TripResponseSerializer(serializers.ModelSerializer):
    route = serializers.SerializerMethodField()
    logs = serializers.SerializerMethodField()
    co_driver_logs = serializers.SerializerMethodField()
    segments = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = [
            "id",
            "current_location",
            "pickup_location",
            "dropoff_location",
            "current_cycle_used_hours",
            "cycle_schedule",
            "cycle_cap_hours",
            "cycle_cap_days",
            "num_drivers",
            "co_driver_name",
            "co_driver_current_cycle_used_hours",
            "restart_hours",
            "driving_hours_today",
            "on_duty_hours_today",
            "operating_mode",
            "work_reporting_location",
            "return_to_reporting_location",
            "use_16_hour_exception",
            "days_past_14th_hour_this_week",
            "exception_applied",
            "exception_reasons",
            "farthest_air_miles",
            "route",
            "logs",
            "co_driver_logs",
            "segments",
            "created_at",
        ]

    def get_route(self, obj):
        return {
            "distance_miles": obj.total_distance_miles,
            "duration_hours": obj.total_duration_hours,
            "trip_span_hours": obj.total_trip_span_hours,
            "current_location_coords": obj.current_location_coords,
            "pickup_location_coords": obj.pickup_location_coords,
            "dropoff_location_coords": obj.dropoff_location_coords,
            "work_reporting_coords": obj.work_reporting_coords or None,
            "geometry": obj.route_geometry,
            "stops": obj.stops,
        }

    def get_logs(self, obj):
        return obj.daily_logs

    def get_co_driver_logs(self, obj):
        # null (not []) for solo trips — an empty list would read as "a team
        # trip where the co-driver somehow logged zero days," which is a
        # different (wrong) claim than "there is no co-driver."
        return obj.co_driver_daily_logs if obj.num_drivers == 2 else None

    def get_segments(self, obj):
        return obj.segments
