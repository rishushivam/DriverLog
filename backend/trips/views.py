from datetime import datetime

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView

from hos_engine import day_bucketing, engine, geometry
from hos_engine.geocoding import GeocodingError, geocode, suggest
from hos_engine.routing import RoutingError, get_route
from hos_engine.team_engine import simulate_team_trip

from .models import Trip
from .serializers import TripRequestSerializer, TripResponseSerializer, resolve_cycle_cap_hours


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


def _build_stops(
    segments,
    leg1_distance_miles,
    leg1_geometry,
    leg2_geometry,
    current_location,
    current_coords,
    pickup_location,
    pickup_coords,
    dropoff_location,
    dropoff_coords,
):
    """Chronological list of map markers. Pickup/dropoff use their exact
    geocoded coordinates; en-route stops (fuel/break/rest/restart) only have
    an odometer reading, so their position is interpolated along whichever
    leg's real route geometry they fall on."""
    stops = [{"coords": current_coords, "label": current_location, "type": "current"}]
    for seg in segments:
        if seg.stop_type is None:
            continue
        if seg.stop_type == "pickup":
            stops.append({"coords": pickup_coords, "label": pickup_location, "type": "pickup"})
        elif seg.stop_type == "dropoff":
            stops.append({"coords": dropoff_coords, "label": dropoff_location, "type": "dropoff"})
        else:
            odometer = seg.odometer_start_miles
            if odometer <= leg1_distance_miles:
                coords = geometry.interpolate_along_route(leg1_geometry, odometer)
            else:
                coords = geometry.interpolate_along_route(leg2_geometry, odometer - leg1_distance_miles)
            stops.append({"coords": coords, "label": seg.remark or seg.stop_type.title(), "type": seg.stop_type})
    return stops


class TripCreateAPIView(APIView):
    def post(self, request):
        req = TripRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        d = req.validated_data

        api_key = settings.ORS_API_KEY
        try:
            current_coords = geocode(d["current_location"], api_key)
            pickup_coords = geocode(d["pickup_location"], api_key)
            dropoff_coords = geocode(d["dropoff_location"], api_key)
            leg1 = get_route(current_coords, pickup_coords, api_key)
            leg2 = get_route(pickup_coords, dropoff_coords, api_key)
        except (GeocodingError, RoutingError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        trip_start = _parse_client_local_time(d.get("client_local_time")) or datetime.now()
        max_cycle_hours = resolve_cycle_cap_hours(d["cycle_schedule"], d.get("custom_cycle_hours"))
        num_drivers = d["num_drivers"]
        restart_hours = d["restart_hours"]

        co_driver_daily_logs = []
        if num_drivers == 2:
            # Real two-driver simulation (see team_engine.py) — independent
            # HOS clocks that alternate who's behind the wheel, not a label.
            # `result` here is the truck-level canonical timeline (same
            # shape/use as solo — map/stops), while the two personal
            # segment lists become two genuinely separate RODS logs.
            result, driver_1_segments, driver_2_segments = simulate_team_trip(
                leg1_distance_miles=leg1["distance_miles"],
                leg2_distance_miles=leg2["distance_miles"],
                current_cycle_used_hours=d["current_cycle_used_hours"],
                trip_start=trip_start,
                current_location_label=d["current_location"],
                pickup_location_label=d["pickup_location"],
                dropoff_location_label=d["dropoff_location"],
                max_cycle_hours=max_cycle_hours,
                restart_hours=restart_hours,
            )
            daily_logs = day_bucketing.build_daily_logs(
                driver_1_segments, starting_cycle_hours=d["current_cycle_used_hours"]
            )
            co_driver_daily_logs = day_bucketing.build_daily_logs(
                driver_2_segments, starting_cycle_hours=d["current_cycle_used_hours"]
            )
        else:
            result = engine.simulate_trip(
                leg1_distance_miles=leg1["distance_miles"],
                leg2_distance_miles=leg2["distance_miles"],
                current_cycle_used_hours=d["current_cycle_used_hours"],
                trip_start=trip_start,
                current_location_label=d["current_location"],
                pickup_location_label=d["pickup_location"],
                dropoff_location_label=d["dropoff_location"],
                max_cycle_hours=max_cycle_hours,
                restart_hours=restart_hours,
            )
            daily_logs = day_bucketing.build_daily_logs(result.segments, starting_cycle_hours=d["current_cycle_used_hours"])

        stops = _build_stops(
            result.segments,
            leg1["distance_miles"],
            leg1["geometry"],
            leg2["geometry"],
            d["current_location"],
            current_coords,
            d["pickup_location"],
            pickup_coords,
            d["dropoff_location"],
            dropoff_coords,
        )

        trip = Trip.objects.create(
            current_location=d["current_location"],
            pickup_location=d["pickup_location"],
            dropoff_location=d["dropoff_location"],
            current_cycle_used_hours=d["current_cycle_used_hours"],
            cycle_schedule=d["cycle_schedule"],
            cycle_cap_hours=max_cycle_hours,
            num_drivers=num_drivers,
            co_driver_name=d.get("co_driver_name", ""),
            restart_hours=restart_hours,
            current_location_coords=current_coords,
            pickup_location_coords=pickup_coords,
            dropoff_location_coords=dropoff_coords,
            total_distance_miles=round(result.total_distance_miles, 1),
            total_duration_hours=round(result.total_duration_hours, 2),
            total_trip_span_hours=round(result.total_trip_span_hours, 2),
            route_geometry={"to_pickup": leg1["geometry"], "to_dropoff": leg2["geometry"]},
            stops=stops,
            segments=[s.to_dict() for s in result.segments],
            daily_logs=[log.to_dict() for log in daily_logs],
            co_driver_daily_logs=[log.to_dict() for log in co_driver_daily_logs],
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
