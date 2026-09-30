# ELD Trip Planner

Takes a trip's current location, pickup location, dropoff location, and a driver's current 70-hour/8-day cycle hours used, and produces:

1. A route map with stops for fuel, mandatory 30-minute breaks, 10-hour resets, and 34-hour restarts.
2. One FMCSA-format "Driver's Daily Log" sheet per day of the trip — drawn, not just listed — matching the real RODS grid (24-hour timeline, 4 duty-status rows, remarks, totals).

Built for a take-home assessment: Django REST backend, React/TypeScript frontend. Scope follows the assessment's own stated assumptions — solo driver, property-carrying, 70-hour/8-day cycle only, no adverse-driving-conditions exception, fueling every 1,000 miles, 1 hour each for pickup/dropoff.

**Live app:** _add the deployed Vercel URL here after deployment_
**API:** _add the deployed Render URL here after deployment_

## Architecture

```
backend/
  config/          Django settings/urls/wsgi
  hos_engine/       pure-Python HOS simulation + day-bucketing + ORS integration — zero Django imports, fully unit-testable
  trips/            the one Django app: model, serializer, the POST /api/trips/ view
frontend/
  src/api/          typed API client
  src/hooks/        useTripPlanner — the submit/loading/error state machine
  src/components/   TripForm, RouteMap (react-leaflet), ELDLogSheet (inline SVG), layout shell
```

The HOS engine (`hos_engine/engine.py`) walks the whole trip as one pass — drive to pickup, load, drive to dropoff, unload — inserting 30-minute breaks after 8 cumulative driving hours, 10-hour resets when the 11-hour driving or 14-hour on-duty window is hit, 34-hour restarts when the 70-hour cycle cap is hit, and fuel stops every 1,000 miles. It emits a flat list of duty-status segments; `day_bucketing.py` splits that into one log per calendar day, handling midnight-spanning segments and padding partial first/last days with Off Duty. Drive time is always computed from distance ÷ an assumed 55 mph, never trusted from OpenRouteService's own `duration` (which reflects car-like travel, not FMCSA rest rules).

Routing/geocoding: [OpenRouteService](https://openrouteservice.org) (free tier, 2,500 requests/day), using the `driving-hgv` (heavy-goods-vehicle) profile so routes respect truck restrictions.

## Local development

**Backend** (Python 3.12+):
```bash
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env   # then set ORS_API_KEY — see below
./venv/bin/python manage.py migrate
./venv/bin/python manage.py runserver 8000
```

**Frontend** (Node 20+):
```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_BASE_URL, defaults to http://localhost:8000
npm run dev
```

**Getting an OpenRouteService API key:** sign up free at [openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup), no credit card required, and put the key in `backend/.env` as `ORS_API_KEY`.

## Tests

```bash
cd backend
./venv/bin/python manage.py test
```

20 tests covering the HOS engine (11-hour/14-hour/70-hour limits never violated, 34-hour restarts trigger and reset correctly, fuel stops land every ~1,000 miles), day-bucketing (every daily log's hours sum to exactly 24.0, midnight-spanning segments split correctly), and the API (valid/invalid payloads, clean error handling for geocoding failures).

## Deployment

**Backend → Render** (free tier): connect the repo, root directory `backend`, and it auto-detects `render.yaml`. Set the `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_ORIGIN_REGEX`, and `ORS_API_KEY` env vars in Render's dashboard (marked `sync: false` in `render.yaml` so they aren't committed). Free-tier services spin down after 15 minutes idle and take up to ~1 minute to wake on the next request — the frontend has a loading-state message for this.

**Frontend → Vercel**: connect the repo, root directory `frontend`. Set `VITE_API_BASE_URL` to the deployed Render URL in Vercel's project settings (must keep the `VITE_` prefix).

## Design

See [DESIGN.md](DESIGN.md) for the visual system and the reasoning behind it.
# DriverLog
