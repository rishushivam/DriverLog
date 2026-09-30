import requests

ORS_BASE_URL = "https://api.openrouteservice.org"


class GeocodingError(Exception):
    pass


def geocode(address: str, api_key: str) -> list:
    """Resolves a free-text address to [longitude, latitude] via ORS."""
    try:
        resp = requests.get(
            f"{ORS_BASE_URL}/geocode/search",
            params={"api_key": api_key, "text": address, "size": 1},
            timeout=10,
        )
    except requests.RequestException as exc:
        raise GeocodingError(f"Could not reach the geocoding service: {exc}") from exc

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
