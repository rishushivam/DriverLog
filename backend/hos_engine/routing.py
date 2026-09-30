import requests

ORS_BASE_URL = "https://api.openrouteservice.org"
METERS_PER_MILE = 1609.344


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
    try:
        resp = requests.post(
            f"{ORS_BASE_URL}/v2/directions/driving-hgv/geojson",
            json={"coordinates": [origin_coords, dest_coords]},
            headers={"Authorization": api_key, "Content-Type": "application/json"},
            timeout=15,
        )
    except requests.RequestException as exc:
        raise RoutingError(f"Could not reach the routing service: {exc}") from exc

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
