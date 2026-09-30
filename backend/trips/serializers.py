from rest_framework import serializers

from hos_engine.constants import CYCLE_SCHEDULES, DEFAULT_CYCLE_SCHEDULE, RESTART_DURATION_HOURS

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
    # Required (and only meaningful) when cycle_schedule == "custom" — lets
    # the tool explore a cycle cap other than the two FMCSA-named ones.
    custom_cycle_hours = serializers.FloatField(min_value=1.0, max_value=168.0, required=False, allow_null=True, default=None)
    # 2 = real team-driving simulation (see hos_engine/team_engine.py), not
    # just a label. Both drivers share the one current_cycle_used_hours
    # input above — no separate per-driver starting cycle.
    num_drivers = serializers.ChoiceField(choices=[1, 2], default=1)
    co_driver_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    # 49 CFR §395.3(c)'s restart is fixed at 34 consecutive hours off duty —
    # exposed as an input anyway so the tool can explore "what if the reset
    # were shorter/longer" scenarios, not because the real rule is
    # negotiable. Default stays the actual regulatory value.
    restart_hours = serializers.FloatField(min_value=1.0, max_value=168.0, default=RESTART_DURATION_HOURS)
    # The driver's own local wall-clock reading at submit time (naive,
    # "YYYY-MM-DDTHH:MM:SS"), supplied by the browser. Optional so direct
    # API callers (tests, curl) keep working without it; the view falls
    # back to the server's own clock when it's absent, which is only ever
    # correct by coincidence when the server and the driver share a
    # timezone.
    client_local_time = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)

    def validate(self, data):
        if data["cycle_schedule"] == "custom" and data.get("custom_cycle_hours") is None:
            raise serializers.ValidationError(
                {"custom_cycle_hours": ["Required when cycle_schedule is 'custom'."]}
            )
        cap = resolve_cycle_cap_hours(data["cycle_schedule"], data.get("custom_cycle_hours"))
        if data["current_cycle_used_hours"] > cap:
            raise serializers.ValidationError(
                {"current_cycle_used_hours": [f"Must be {cap:.0f} or less for this schedule."]}
            )
        return data


def resolve_cycle_cap_hours(cycle_schedule: str, custom_cycle_hours) -> float:
    """The cap the engine actually enforces — 70/60 for a named schedule, or
    the driver-supplied value for "custom". Shared by validate() above and
    the view, so there's exactly one place that knows how to read this."""
    if cycle_schedule == "custom":
        return custom_cycle_hours
    return CYCLE_SCHEDULES[cycle_schedule]


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
            "num_drivers",
            "co_driver_name",
            "restart_hours",
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
