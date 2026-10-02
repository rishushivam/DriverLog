from datetime import datetime

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView

from hos_engine import day_bucketing, engine, geometry
from hos_engine import exceptions as hos_exceptions
from hos_engine.geocoding import GeocodingError, geocode, suggest
from hos_engine.routing import RoutingError, get_route
from hos_engine.rules import (
    SHORT_HAUL_CDL,
    SHORT_HAUL_NON_CDL,
    STANDARD,
    short_haul_cdl_rules,
    short_haul_non_cdl_rules,
    standard_rules,
)
from hos_engine.team_engine import simulate_team_trip

from .models import Trip
from .serializers import TripRequestSerializer, TripResponseSerializer, resolve_cycle_cap_days, resolve_cycle_cap_hours


def _parse_client_local_time(value):
    """The engine anchors the whole simulation to "now" in the driver's own
    local time (see day_bucketing's own timezone-anchor note) — but the
    server's `datetime.now()` is the server's timezone, which has nothing
    to do with where the driver actually is. The browser knows the
    driver's real local clock reading, so we use that when it's sent."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None


def _build_stops(segments, legs, current_location, current_coords, named):
    """Chronological list of map markers. Named stops (pickup/dropoff/
    return) use their exact geocoded coordinates; en-route stops (fuel/
    break/rest/restart/cycle wait) only have an odometer reading, so their
    position is interpolated along whichever leg's real route geometry
    they fall on. `legs` is a list of (distance_miles, geometry) in trip
    order; `named` maps stop_type -> (label, coords)."""
    stops = [{"coords": current_coords, "label": current_location, "type": "current"}]
    for seg in segments:
        if seg.stop_type is None:
            continue
        if seg.stop_type in named:
            label, coords = named[seg.stop_type]
            stops.append({"coords": coords, "label": label, "type": seg.stop_type})
            continue
        odometer = seg.odometer_start_miles
        offset = 0.0
        coords = legs[-1][1][-1] if legs and legs[-1][1] else current_coords
        for distance, geom in legs:
            if odometer <= offset + distance + 1e-6:
                coords = geometry.interpolate_along_route(geom, odometer - offset)
                break
            offset += distance
        stops.append({"coords": coords, "label": seg.remark or seg.stop_type.title(), "type": seg.stop_type})
    return stops


def _rules_for(d):
    mode = d["operating_mode"]
    if mode == SHORT_HAUL_CDL:
        return short_haul_cdl_rules()
    if mode == SHORT_HAUL_NON_CDL:
        return short_haul_non_cdl_rules(d["days_past_14th_hour_this_week"])
    return standard_rules(use_16_hour_exception=d["use_16_hour_exception"])


class TripCreateAPIView(APIView):
    def post(self, request):
        req = TripRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        d = req.validated_data

        api_key = settings.ORS_API_KEY
        mode = d["operating_mode"]
        wants_return = d["return_to_reporting_location"]
        reporting_location = d.get("work_reporting_location", "").strip() or d["current_location"]
        try:
            current_coords = geocode(d["current_location"], api_key)
            pickup_coords = geocode(d["pickup_location"], api_key)
            dropoff_coords = geocode(d["dropoff_location"], api_key)
            reporting_coords = (
                current_coords if reporting_location == d["current_location"] else geocode(reporting_location, api_key)
            )
            leg1 = get_route(current_coords, pickup_coords, api_key)
            leg2 = get_route(pickup_coords, dropoff_coords, api_key)
            leg3 = get_route(dropoff_coords, reporting_coords, api_key) if wants_return else None
        except (GeocodingError, RoutingError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        trip_start = _parse_client_local_time(d.get("client_local_time")) or datetime.now()
        max_cycle_hours = resolve_cycle_cap_hours(d["cycle_schedule"], d.get("custom_cycle_hours"))
        cycle_cap_days = resolve_cycle_cap_days(d["cycle_schedule"], d.get("custom_cycle_days"))
        num_drivers = d["num_drivers"]
        restart_hours = d["restart_hours"]
        co_driver_cycle_used_hours = d.get("co_driver_current_cycle_used_hours")
        leg3_miles = leg3["distance_miles"] if leg3 else 0.0

        polylines = [leg1["geometry"], leg2["geometry"]] + ([leg3["geometry"]] if leg3 else [])
        farthest_air_miles = hos_exceptions.max_air_miles_from(reporting_coords, polylines + [[reporting_coords]])

        def plan(rules):
            common = dict(
                leg1_distance_miles=leg1["distance_miles"],
                leg2_distance_miles=leg2["distance_miles"],
                current_cycle_used_hours=d["current_cycle_used_hours"],
                trip_start=trip_start,
                current_location_label=d["current_location"],
                pickup_location_label=d["pickup_location"],
                dropoff_location_label=d["dropoff_location"],
                max_cycle_hours=max_cycle_hours,
                restart_hours=restart_hours,
                cycle_cap_days=cycle_cap_days,
                driving_hours_today=d["driving_hours_today"],
                on_duty_hours_today=d["on_duty_hours_today"],
                rules=rules,
                leg3_distance_miles=leg3_miles,
                reporting_location_label=reporting_location if wants_return else None,
            )
            if num_drivers == 2:
                result, d1, d2 = simulate_team_trip(driver_2_cycle_used_hours=co_driver_cycle_used_hours, **common)
                return result, d1, d2
            result = engine.simulate_trip(**common)
            return result, result.segments, None

        # Plan under the requested rules, judge the finished plan the way
        # an auditor would, and if the exception's own conditions fail,
        # re-plan under §395.3 and say why — the guide: when the exception
        # no longer applies the driver completes a RODS for that day.
        rules = _rules_for(d)
        result, driver_1_segments, driver_2_segments = plan(rules)
        evaluation = None
        if mode in (SHORT_HAUL_CDL, SHORT_HAUL_NON_CDL):
            window_offset = max(d["on_duty_hours_today"], d["driving_hours_today"])
            evaluation = hos_exceptions.evaluate_short_haul(
                driver_1_segments, rules, farthest_air_miles, wants_return, window_offset_hours=window_offset
            )
            if not evaluation.applied:
                rules = standard_rules()
                result, driver_1_segments, driver_2_segments = plan(rules)
                reasons = evaluation.reasons
                evaluation = hos_exceptions.evaluate_short_haul(
                    driver_1_segments, rules, farthest_air_miles, wants_return, window_offset_hours=window_offset
                )
                evaluation.applied = False
                evaluation.reasons = reasons
        elif d["use_16_hour_exception"]:
            evaluation = hos_exceptions.evaluate_16_hour(
                driver_1_segments, rules, wants_return,
                window_offset_hours=max(d["on_duty_hours_today"], d["driving_hours_today"]),
            )

        def logs_for(segments, starting_hours):
            logs = day_bucketing.build_daily_logs(
                segments,
                starting_cycle_hours=starting_hours,
                cycle_cap_days=cycle_cap_days,
                max_cycle_hours=max_cycle_hours,
                restart_hours=restart_hours,
            )
            return hos_exceptions.annotate_logs([log.to_dict() for log in logs], evaluation, rules)

        daily_logs = logs_for(driver_1_segments, d["current_cycle_used_hours"])
        co_driver_daily_logs = (
            logs_for(
                driver_2_segments,
                d["current_cycle_used_hours"] if co_driver_cycle_used_hours is None else co_driver_cycle_used_hours,
            )
            if driver_2_segments is not None
            else []
        )

        legs = [(leg1["distance_miles"], leg1["geometry"]), (leg2["distance_miles"], leg2["geometry"])]
        if leg3:
            legs.append((leg3["distance_miles"], leg3["geometry"]))
        stops = _build_stops(
            result.segments,
            legs,
            d["current_location"],
            current_coords,
            {
                "pickup": (d["pickup_location"], pickup_coords),
                "dropoff": (d["dropoff_location"], dropoff_coords),
                "return": (reporting_location, reporting_coords),
            },
        )

        trip = Trip.objects.create(
            current_location=d["current_location"],
            pickup_location=d["pickup_location"],
            dropoff_location=d["dropoff_location"],
            current_cycle_used_hours=d["current_cycle_used_hours"],
            cycle_schedule=d["cycle_schedule"],
            cycle_cap_hours=max_cycle_hours,
            cycle_cap_days=cycle_cap_days,
            num_drivers=num_drivers,
            co_driver_name=d.get("co_driver_name", ""),
            co_driver_current_cycle_used_hours=co_driver_cycle_used_hours,
            restart_hours=restart_hours,
            driving_hours_today=d["driving_hours_today"],
            on_duty_hours_today=d["on_duty_hours_today"],
            operating_mode=mode,
            work_reporting_location=reporting_location if wants_return else "",
            work_reporting_coords=reporting_coords if wants_return else [],
            return_to_reporting_location=wants_return,
            use_16_hour_exception=d["use_16_hour_exception"],
            days_past_14th_hour_this_week=d["days_past_14th_hour_this_week"],
            exception_applied=bool(evaluation and evaluation.applied),
            exception_reasons=list(evaluation.reasons) if evaluation else [],
            farthest_air_miles=round(farthest_air_miles, 1) if wants_return else None,
            current_location_coords=current_coords,
            pickup_location_coords=pickup_coords,
            dropoff_location_coords=dropoff_coords,
            total_distance_miles=round(result.total_distance_miles, 1),
            total_duration_hours=round(result.total_duration_hours, 2),
            total_trip_span_hours=round(result.total_trip_span_hours, 2),
            route_geometry={
                "to_pickup": leg1["geometry"],
                "to_dropoff": leg2["geometry"],
                "to_reporting": leg3["geometry"] if leg3 else None,
            },
            stops=stops,
            segments=[s.to_dict() for s in result.segments],
            daily_logs=daily_logs,
            co_driver_daily_logs=co_driver_daily_logs,
        )
        return Response(TripResponseSerializer(trip).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def health(request):
    return Response({"status": "ok"})


@api_view(["GET"])
def geocode_suggest(request):
    """Proxies ORS's autocomplete endpoint so the API key never reaches the
    browser and live-typing keystrokes don't need a client-side quota
    concern of their own. Never errors — returns [] on any upstream issue,
    since suggestions are a nice-to-have, not a required feature."""
    query = request.query_params.get("q", "")
    results = suggest(query, settings.ORS_API_KEY)
    return Response(results)
