import time

import requests

ORS_BASE_URL = "https://api.openrouteservice.org"
METERS_PER_MILE = 1609.344
# See geocoding.py's own note: one retry absorbs a transient connection-
# level blip (timeout, DNS, connection refused) from a free-tier host's
# less consistent outbound network — never retries an actual HTTP error
# response, only a transport-level exception.
_MAX_ATTEMPTS = 2
_RETRY_DELAY_SECONDS = 1.5
# ORS snaps each coordinate to the nearest truck-routable road within 350 m
# by default. A geocoder often returns the centroid of a town, district or
# postcode, which can sit in open country well outside that, and the
# request fails with error code 2010. On that specific error the request
# is retried with progressively wider snapping radii (meters) before giving
# up — the plan is still measured from the road the truck would actually
# use, since the snapped point is where routing starts.
_SNAP_RADII_METERS = (350, 2000, 10000)
_UNROUTABLE_POINT_CODE = 2010
# The public ORS server refuses any single request whose route would
# exceed 6,000 km (error 2004). No leg of a Part 395 trip comes close, so
# this is pre-checked on the great-circle distance before calling out.
_ROUTE_LIMIT_CODE = 2004
MAX_LEG_STATUTE_MILES = 6_000_000 / METERS_PER_MILE  # ~3,728 mi


class RoutingError(Exception):
    pass


def _great_circle_miles(a: list, b: list) -> float:
    from .geometry import _haversine_miles

    return _haversine_miles(a, b)


def get_route(origin_coords: list, dest_coords: list, api_key: str) -> dict:
    """origin_coords/dest_coords are [lng, lat]. Uses the heavy-goods-vehicle
    profile (not driving-car) so the route respects truck restrictions.
    Returns {"distance_miles": float, "geometry": [[lng, lat], ...]}.
    Distance is the only thing consumed from ORS for HOS purposes — drive
    TIME is always derived by hos_engine itself from distance / assumed
    average truck speed, never from ORS's own "duration" (which reflects
    car-like travel patterns with no awareness of FMCSA rest rules).
    """
    straight = _great_circle_miles(origin_coords, dest_coords)
    if straight > MAX_LEG_STATUTE_MILES:
        raise RoutingError(
            f"These two locations are about {straight:,.0f} miles apart in a straight line. "
            f"The routing service plans legs up to {MAX_LEG_STATUTE_MILES:,.0f} road miles; split the trip or check the addresses."
        )
    resp = None
    for radius in _SNAP_RADII_METERS:
        resp = _post_directions(origin_coords, dest_coords, api_key, radius)
        if resp.status_code == 200:
            features = resp.json().get("features", [])
            if not features:
                raise RoutingError("No route found between the given locations.")
            feature = features[0]
            distance_meters = feature["properties"]["summary"]["distance"]
            return {
                "distance_miles": distance_meters / METERS_PER_MILE,
                "geometry": feature["geometry"]["coordinates"],
            }
        if not _is_unroutable_point(resp):
            break

    if _error_code(resp) == _ROUTE_LIMIT_CODE:
        raise RoutingError(
            f"This leg is longer than the routing service allows ({MAX_LEG_STATUTE_MILES:,.0f} road miles). "
            "Split the trip into shorter legs or check the addresses."
        )
    if _is_unroutable_point(resp):
        raise RoutingError(
            "One of the locations is not within 10 km of a road a truck can use. "
            "Try a street address, a town centre or a highway exit instead of a district or region name."
        )
    raise RoutingError(f"Routing request failed ({resp.status_code}): {resp.text[:200]}")


def _post_directions(origin_coords: list, dest_coords: list, api_key: str, radius_meters: int):
    last_exc: requests.RequestException | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            return requests.post(
                f"{ORS_BASE_URL}/v2/directions/driving-hgv/geojson",
                json={"coordinates": [origin_coords, dest_coords], "radiuses": [radius_meters, radius_meters]},
                headers={"Authorization": api_key, "Content-Type": "application/json"},
                timeout=20,
            )
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < _MAX_ATTEMPTS - 1:
                time.sleep(_RETRY_DELAY_SECONDS)
    raise RoutingError(f"Could not reach the routing service: {last_exc}") from last_exc


def _error_code(resp):
    try:
        return resp.json().get("error", {}).get("code")
    except ValueError:
        return None


def _is_unroutable_point(resp) -> bool:
    return _error_code(resp) == _UNROUTABLE_POINT_CODE

