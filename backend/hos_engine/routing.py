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


class RoutingError(Exception):
    pass


def get_route(origin_coords: list, dest_coords: list, api_key: str) -> dict:
    """origin_coords/dest_coords are [lng, lat]. Uses the heavy-goods-vehicle
    profile (not driving-car) so the route respects truck restrictions.
    Returns {"distance_miles": float, "geometry": [[lng, lat], ...]}.
    Distance is the only thing consumed from ORS for HOS purposes — drive
    TIME is always derived by hos_engine itself from distance / assumed
    average truck speed, never from ORS's own "duration" (which reflects
    car-like travel patterns with no awareness of FMCSA rest rules).
    """
    last_exc: requests.RequestException | None = None
    resp = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            resp = requests.post(
                f"{ORS_BASE_URL}/v2/directions/driving-hgv/geojson",
                json={"coordinates": [origin_coords, dest_coords]},
                headers={"Authorization": api_key, "Content-Type": "application/json"},
                timeout=20,
            )
            break
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < _MAX_ATTEMPTS - 1:
                time.sleep(_RETRY_DELAY_SECONDS)
    if resp is None:
        raise RoutingError(f"Could not reach the routing service: {last_exc}") from last_exc

    if resp.status_code != 200:
        raise RoutingError(f"Routing request failed ({resp.status_code}): {resp.text[:200]}")

    features = resp.json().get("features", [])
    if not features:
        raise RoutingError("No route found between the given locations.")

    feature = features[0]
    distance_meters = feature["properties"]["summary"]["distance"]
    return {
        "distance_miles": distance_meters / METERS_PER_MILE,
        "geometry": feature["geometry"]["coordinates"],
    }
