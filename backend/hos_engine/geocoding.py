import time

import requests

ORS_BASE_URL = "https://api.openrouteservice.org"
# A free-tier host's outbound network is more prone to occasional slow DNS/
# TLS handshakes than a local dev machine, especially right after waking
# from an idle spin-down — one quick retry on a connection-level failure
# (timeout, DNS, connection refused) absorbs that without making a user
# resubmit the whole form for what's usually a one-off blip. This never
# retries an actual HTTP error response (4xx/5xx) — only a transport-level
# exception, handled separately below.
_MAX_ATTEMPTS = 2
_RETRY_DELAY_SECONDS = 1.5


class GeocodingError(Exception):
    pass


def geocode(address: str, api_key: str) -> list:
    """Resolves a free-text address to [longitude, latitude] via ORS."""
    last_exc: requests.RequestException | None = None
    resp = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            resp = requests.get(
                f"{ORS_BASE_URL}/geocode/search",
                params={"api_key": api_key, "text": address, "size": 1},
                timeout=20,
            )
            break
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < _MAX_ATTEMPTS - 1:
                time.sleep(_RETRY_DELAY_SECONDS)
    if resp is None:
        raise GeocodingError(f"Could not reach the geocoding service: {last_exc}") from last_exc

    if resp.status_code != 200:
        raise GeocodingError(f"Geocoding request failed ({resp.status_code}) for '{address}'.")

    features = resp.json().get("features", [])
    if not features:
        raise GeocodingError(f"Could not find a location matching '{address}'.")
    return features[0]["geometry"]["coordinates"]


def suggest(text: str, api_key: str, size: int = 5) -> list:
    """Live-typing suggestions via ORS's autocomplete endpoint. Returns
    [{"label": str, "coords": [lng, lat]}, ...], or [] on any failure —
    autocomplete is a nice-to-have, never worth surfacing an error for."""
    if len(text.strip()) < 3:
        return []
    try:
        resp = requests.get(
            f"{ORS_BASE_URL}/geocode/autocomplete",
            params={"api_key": api_key, "text": text, "size": size},
            timeout=6,
        )
    except requests.RequestException:
        return []

    if resp.status_code != 200:
        return []

    return [
        {"label": f["properties"]["label"], "coords": f["geometry"]["coordinates"]}
        for f in resp.json().get("features", [])
    ]


def reverse(lng: float, lat: float, api_key: str) -> str | None:
    """Nearest named place (town/locality) for a coordinate, via ORS's
    reverse endpoint. Used only to label engine-placed stops ("En route,
    mile 440") with somewhere a dispatcher recognises. Returns None on any
    failure — a place name is a nicety, never worth an error."""
    try:
        resp = requests.get(
            f"{ORS_BASE_URL}/geocode/reverse",
            params={
                "api_key": api_key,
                "point.lon": lng,
                "point.lat": lat,
                "size": 1,
                "layers": "locality,localadmin,county",
            },
            timeout=6,
        )
    except requests.RequestException:
        return None
    if resp.status_code != 200:
        return None
    features = resp.json().get("features", [])
    if not features:
        return None
    props = features[0].get("properties", {})
    name = props.get("locality") or props.get("localadmin") or props.get("county") or props.get("name")
    region = props.get("region_a") or props.get("region")
    if not name:
        return props.get("label")
    return f"{name}, {region}" if region else name
