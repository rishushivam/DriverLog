"""Great-circle interpolation along an ORS route polyline.

En-route stops (fuel/break/rest/restart) only have an odometer reading, not
a geocoded position — this walks the route's own geometry accumulating
Haversine distance between consecutive points until it reaches the target
mileage, then linearly interpolates within that final short sub-segment.
"""

import math

EARTH_RADIUS_MILES = 3958.8


def _haversine_miles(p1: list, p2: list) -> float:
    lon1, lat1 = math.radians(p1[0]), math.radians(p1[1])
    lon2, lat2 = math.radians(p2[0]), math.radians(p2[1])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(min(1.0, a)))


def interpolate_along_route(geometry: list, target_miles: float) -> list:
    """geometry: [[lng, lat], ...]. Returns the [lng, lat] at `target_miles`
    along the polyline (clamped to the route's own endpoints)."""
    if not geometry:
        return [0.0, 0.0]
    if target_miles <= 0:
        return geometry[0]

    cumulative = 0.0
    last_index = len(geometry) - 2
    for i in range(len(geometry) - 1):
        seg_dist = _haversine_miles(geometry[i], geometry[i + 1])
        if cumulative + seg_dist >= target_miles or i == last_index:
            remaining = target_miles - cumulative
            frac = 0.0 if seg_dist <= 0 else min(max(remaining / seg_dist, 0.0), 1.0)
            lng = geometry[i][0] + (geometry[i + 1][0] - geometry[i][0]) * frac
            lat = geometry[i][1] + (geometry[i + 1][1] - geometry[i][1]) * frac
            return [lng, lat]
        cumulative += seg_dist
    return geometry[-1]
