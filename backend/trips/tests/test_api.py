from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from hos_engine.geocoding import GeocodingError

FAKE_COORDS = {
    "233 S Wacker Dr, Chicago, IL": [-87.6371, 41.8789],
    "1520 Demonbreun St, Nashville, TN": [-86.7844, 36.1591],
    "191 Peachtree St NE, Atlanta, GA": [-84.3880, 33.7595],
}


def _fake_geocode(address, api_key):
    return FAKE_COORDS.get(address, [-87.0, 41.0])


def _fake_get_route(origin, dest, api_key):
    return {"distance_miles": 300.0, "geometry": [origin, dest]}


class TripApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.valid_payload = {
            "current_location": "233 S Wacker Dr, Chicago, IL",
            "pickup_location": "1520 Demonbreun St, Nashville, TN",
            "dropoff_location": "191 Peachtree St NE, Atlanta, GA",
            "current_cycle_used_hours": 10.0,
        }

    @patch("trips.views.get_route", side_effect=_fake_get_route)
    @patch("trips.views.geocode", side_effect=_fake_geocode)
    def test_valid_payload_returns_201_with_logs(self, mock_geocode, mock_route):
        response = self.client.post("/api/trips/", self.valid_payload, format="json")
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("route", data)
        self.assertIn("logs", data)
        self.assertGreaterEqual(len(data["logs"]), 1)
        for log in data["logs"]:
            self.assertAlmostEqual(sum(log["totals"].values()), 24.0, places=1)

    def test_rejects_blank_location(self):
        payload = {**self.valid_payload, "current_location": ""}
        response = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(response.status_code, 400)

    def test_rejects_cycle_hours_out_of_range(self):
        payload = {**self.valid_payload, "current_cycle_used_hours": 71.0}
        response = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(response.status_code, 400)

    def test_custom_schedule_without_custom_cycle_hours_or_days_is_rejected(self):
        payload = {**self.valid_payload, "cycle_schedule": "custom"}
        response = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        errors = response.json()
        self.assertIn("custom_cycle_hours", errors)
        self.assertIn("custom_cycle_days", errors)

    def test_custom_schedule_missing_only_custom_cycle_days_is_rejected(self):
        payload = {**self.valid_payload, "cycle_schedule": "custom", "custom_cycle_hours": 45.0}
        response = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("custom_cycle_days", response.json())

    @patch("trips.views.get_route", side_effect=_fake_get_route)
    @patch("trips.views.geocode", side_effect=_fake_geocode)
    def test_custom_cycle_hours_and_days_are_honored_end_to_end(self, mock_geocode, mock_route):
        payload = {
            **self.valid_payload,
            "cycle_schedule": "custom",
            "custom_cycle_hours": 45.0,
            "custom_cycle_days": 6,
            "current_cycle_used_hours": 40.0,
        }
        response = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["cycle_schedule"], "custom")
        self.assertEqual(data["cycle_cap_hours"], 45.0)
        self.assertEqual(data["cycle_cap_days"], 6)

    def test_custom_cycle_hours_still_enforces_its_own_cap(self):
        payload = {
            **self.valid_payload,
            "cycle_schedule": "custom",
            "custom_cycle_hours": 45.0,
            "custom_cycle_days": 6,
            "current_cycle_used_hours": 50.0,
        }
        response = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(response.status_code, 400)

    @patch("trips.views.get_route", side_effect=_fake_get_route)
    @patch("trips.views.geocode", side_effect=_fake_geocode)
    def test_named_schedules_report_their_own_cycle_cap_days(self, mock_geocode, mock_route):
        response = self.client.post(
            "/api/trips/", {**self.valid_payload, "cycle_schedule": "60/7"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["cycle_cap_days"], 7)

    @patch(
        "trips.views.geocode",
        side_effect=GeocodingError("Could not find a location matching 'Nowhereville'."),
    )
    def test_geocoding_failure_returns_clean_422_not_500(self, mock_geocode):
        payload = {**self.valid_payload, "current_location": "Nowhereville"}
        response = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(response.status_code, 422)
        self.assertIn("error", response.json())

    @patch("trips.views.get_route", side_effect=_fake_get_route)
    @patch("trips.views.geocode", side_effect=_fake_geocode)
    def test_two_drivers_returns_separate_co_driver_logs(self, mock_geocode, mock_route):
        payload = {**self.valid_payload, "num_drivers": 2, "co_driver_name": "Jamie Rivera"}
        response = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["num_drivers"], 2)
        self.assertEqual(data["co_driver_name"], "Jamie Rivera")
        self.assertIsNotNone(data["co_driver_logs"])
        self.assertGreaterEqual(len(data["co_driver_logs"]), 1)
        for log in data["logs"] + data["co_driver_logs"]:
            self.assertAlmostEqual(sum(log["totals"].values()), 24.0, places=1)

    @patch("trips.views.get_route", side_effect=_fake_get_route)
    @patch("trips.views.geocode", side_effect=_fake_geocode)
    def test_custom_restart_hours_is_honored_end_to_end(self, mock_geocode, mock_route):
        payload = {**self.valid_payload, "current_cycle_used_hours": 68.0, "restart_hours": 5.0}
        response = self.client.post("/api/trips/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["restart_hours"], 5.0)
        restart_segments = [s for s in data["segments"] if s["stop_type"] == "restart"]
        self.assertEqual(len(restart_segments), 1)

    @patch("trips.views.get_route", side_effect=_fake_get_route)
    @patch("trips.views.geocode", side_effect=_fake_geocode)
    def test_restart_hours_defaults_to_34_when_omitted(self, mock_geocode, mock_route):
        response = self.client.post("/api/trips/", self.valid_payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["restart_hours"], 34.0)

    @patch("trips.views.get_route", side_effect=_fake_get_route)
    @patch("trips.views.geocode", side_effect=_fake_geocode)
    def test_one_driver_co_driver_logs_is_null(self, mock_geocode, mock_route):
        response = self.client.post("/api/trips/", self.valid_payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.json()["co_driver_logs"])


class GeocodeSuggestApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch(
        "trips.views.suggest",
        return_value=[{"label": "233 S Wacker Dr, Chicago, IL, USA", "coords": [-87.6371, 41.8789]}],
    )
    def test_returns_suggestions_for_a_query(self, mock_suggest):
        response = self.client.get("/api/geocode-suggest/?q=233 S Wacker")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

    def test_missing_query_returns_empty_list_not_error(self):
        response = self.client.get("/api/geocode-suggest/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])
