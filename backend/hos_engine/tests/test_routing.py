import unittest
from unittest.mock import patch

from ..routing import MAX_LEG_STATUTE_MILES, RoutingError, get_route


class _Resp:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body
        self.text = str(body)

    def json(self):
        return self._body


UNROUTABLE = {"error": {"code": 2010, "message": "Could not find routable point within a radius of 350.0 meters"}}
OK = {"features": [{"properties": {"summary": {"distance": 1609.344}}, "geometry": {"coordinates": [[0, 0], [1, 1]]}}]}


class RoutingSnapRadiusTests(unittest.TestCase):
    @patch("hos_engine.routing.requests.post")
    def test_widens_snapping_radius_on_unroutable_point(self, post):
        post.side_effect = [_Resp(404, UNROUTABLE), _Resp(200, OK)]
        route = get_route([0, 0], [1, 1], "key")
        self.assertAlmostEqual(route["distance_miles"], 1.0)
        radii = [call.kwargs["json"]["radiuses"] for call in post.call_args_list]
        self.assertEqual(radii, [[350, 350], [2000, 2000]])

    @patch("hos_engine.routing.requests.post")
    def test_gives_a_plain_message_when_no_radius_works(self, post):
        post.side_effect = [_Resp(404, UNROUTABLE)] * 3
        with self.assertRaises(RoutingError) as ctx:
            get_route([0, 0], [1, 1], "key")
        self.assertIn("not within 10 km of a road", str(ctx.exception))
        self.assertEqual(post.call_count, 3)

    @patch("hos_engine.routing.requests.post")
    def test_other_errors_are_not_retried_with_wider_radii(self, post):
        post.side_effect = [_Resp(403, {"error": {"code": 1, "message": "forbidden"}})]
        with self.assertRaises(RoutingError):
            get_route([0, 0], [1, 1], "key")
        self.assertEqual(post.call_count, 1)

    @patch("hos_engine.routing.requests.post")
    def test_rejects_a_leg_beyond_the_service_limit_before_calling_out(self, post):
        # Delhi -> New York is ~7,300 statute miles in a straight line.
        with self.assertRaises(RoutingError) as ctx:
            get_route([77.2090, 28.6139], [-74.0060, 40.7128], "key")
        self.assertIn("miles apart", str(ctx.exception))
        self.assertEqual(post.call_count, 0)
        self.assertGreater(MAX_LEG_STATUTE_MILES, 3700)

    @patch("hos_engine.routing.requests.post")
    def test_explains_the_route_length_limit_error(self, post):
        post.side_effect = [_Resp(400, {"error": {"code": 2004, "message": "exceed the server configuration limits"}})]
        with self.assertRaises(RoutingError) as ctx:
            get_route([0, 0], [1, 1], "key")
        self.assertIn("longer than the routing service allows", str(ctx.exception))
