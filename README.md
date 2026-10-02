<div align="center">

# ELD Trip Planner

**Turn a trip's start/pickup/dropoff into a compliant route and print-ready FMCSA daily logs — automatically.**

[![Live App](https://img.shields.io/badge/Live%20App-driver--log--mauve.vercel.app-1b2a47?style=for-the-badge&logo=vercel&logoColor=white)](https://driver-log-mauve.vercel.app/)
[![API](https://img.shields.io/badge/API-driverlog--ohu2.onrender.com-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://driverlog-ohu2.onrender.com/api/health/)

![Django](https://img.shields.io/badge/Django-6.1-092E20?style=flat-square&logo=django&logoColor=white)
![DRF](https://img.shields.io/badge/DRF-3.18-A30000?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tests](https://img.shields.io/badge/backend%20tests-88%20passing-2e7d32?style=flat-square)
![Tests](https://img.shields.io/badge/frontend%20tests-15%20passing-2e7d32?style=flat-square)
![License](https://img.shields.io/badge/no%20card%20required-Render%20%2B%20Vercel-black?style=flat-square)

</div>

---

## What it does

A dispatcher enters a driver's **current location, pickup, dropoff, and current cycle hours used**. The app returns:

1. **A route map** with every required stop — fuel, mandatory 30-minute breaks, 10-hour resets, and 34-hour restarts — plotted on the actual truck-legal (heavy-goods-vehicle) road route.
2. **One FMCSA-format "Driver's Daily Log" per day of the trip** — genuinely *drawn*, not just listed: the real 24-hour RODS grid, 4 duty-status rows, a stepped status line, remarks, totals, and the Recap section — print/PDF-ready.

All of it computed from **49 CFR Part 395** hours-of-service rules, not approximated.

## Try it live

**[driver-log-mauve.vercel.app](https://driver-log-mauve.vercel.app/)** — no login, just fill in a trip and click **Plan trip**.

> First request after ~15 minutes of inactivity takes 30–60s to wake the free-tier API back up — the app's own loading state tells you this is happening, it's not a bug.

## Highlights (past the take-home brief's base scope)

| Feature | What it does |
|---|---|
| **Team driving** | Toggle 1 or 2 drivers. With 2, the engine runs **two fully independent HOS clocks** that alternate who's behind the wheel — real regulatory team-driving logic, not a cosmetic label. Each driver gets their own separate RODS log. |
| **Configurable cycle schedule** | 70-hour/8-day, 60-hour/7-day, or a fully **custom cap + day count** — for exploring "what if" scenarios beyond the two FMCSA-named schedules. |
| **Configurable restart duration** | §395.3(c)'s 34-hour restart is the default, but it's an input — see how a shorter/longer reset changes the whole trip. |
| **Live location autocomplete** | Debounced, abortable, keyboard-navigable suggestions as you type — proxied server-side so the ORS key never reaches the browser. |
| **Interactive, linked views** | Hover or click a stop on the map, the timeline, or the log sheet's duty-status graph, and the same event highlights everywhere else — clicking a marker scrolls the timeline to that stop and switches the log to that day. |
| **Print / Save as PDF** | Each day's log renders as its own print page, sized and paginated like the real paper form. |
| **Short-haul & 16-hour exceptions** | §395.1(e) CDL / non-CDL short-haul and the §395.1(o) 16-hour exception are inputs. The engine plans under the relaxed rules, then audits the finished plan; if it fails, it re-plans under standard rules and tells you which test failed. |
| **One computed plan** | Every number on screen — summary, map, timeline, sidebar cycle meter, log recap — derives from a single `buildTripPlan()` object, so "Total trip" (elapsed time) and "Days" (calendar days touched) can never disagree. |
| **Actionable review** | "Needs review" opens a panel listing each concern with a one-click fix: *Start with a fresh 10-hr rest* or *Optimize schedule* re-plan the trip with the adjusted input. |
| **Map that explains itself** | Numbered markers with a distinct shape + colour + icon per stop type, a route line coloured per day, a legend that filters, place names for engine-placed stops ("Near Murfreesboro, TN"), recenter and fullscreen. |
| **Collapsible sidebar & drawer** | Desktop sidebar collapses to an icon rail (`[`); below 1024 px it is an overlay drawer. Sticky Plan trip / Reset bar, sticky section nav over the results. |
| **Share & recent trips** | Copy a link that encodes the trip inputs; the last eight trips are one click away. |
| **Light / Dark / System** | Labeled theme control; the log sheet stays paper-white by default (or matches the theme) and always prints as paper. |

## Architecture

```
backend/
  config/            Django settings/urls/wsgi
  hos_engine/        pure-Python HOS simulation — zero Django/HTTP imports, fully unit-testable
    engine.py           solo-driver simulation
    team_engine.py      two-driver simulation (independent clocks, role handoffs)
    day_bucketing.py    flat segment list → one FMCSA daily log per calendar day
    geocoding.py        OpenRouteService geocode + autocomplete (retried on transient failure)
    routing.py          OpenRouteService driving-hgv directions
  trips/             the one Django app: model, serializers, the POST /api/trips/ view
frontend/
  src/api/           typed API client
  src/model/         tripPlan — ONE computed plan object every view reads from; format, routeGeometry
  src/hooks/         useTripPlanner (submit/retry/reset), useTheme, useSidebar, useUnits, useRecentTrips…
  src/components/    layout (Header, Sidebar, SectionNav), ui primitives, TripForm, RouteMap, TripWorkspace, ELDLogSheet
  src/config/        stop-type colors/icons/labels — one source of truth shared across every view
  CHANGELOG.md       every UX problem the refactor addressed and how
```

The HOS engine walks the whole trip as one pass — drive to pickup, load, drive to dropoff, unload — inserting 30-minute breaks after 8 cumulative driving hours, 10-hour resets when the 11-hour driving or 14-hour on-duty window is hit, restarts when the cycle cap is hit, and fuel stops every 1,000 miles. It emits a flat list of duty-status segments; `day_bucketing.py` splits that into one log per calendar day, handling midnight-spanning segments and padding partial first/last days with Off Duty. Drive time is always computed from distance ÷ an assumed 55 mph, never trusted from OpenRouteService's own `duration` (which reflects car-like travel, not FMCSA rest rules).

Routing/geocoding: [OpenRouteService](https://openrouteservice.org) (free tier, no card), using the `driving-hgv` profile so routes respect truck restrictions.

## Local development

**Backend** (Python 3.12):
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

**Getting an OpenRouteService API key:** sign up free at [openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup) — no credit card required — and put the key in `backend/.env` as `ORS_API_KEY`.

## Tests

**Backend** — `cd backend && ./venv/bin/python manage.py test` — **88 tests**:
- `hos_engine/tests/test_engine.py` — solo-driver simulation: 11-hour/14-hour/cycle limits never violated, restarts trigger and reset correctly (including a custom restart length), fuel stops land every ~1,000 miles.
- `hos_engine/tests/test_team_engine.py` — two-driver simulation: the truck keeps moving through what would force a solo reset, neither driver ever exceeds their own 11-hour limit, a resting driver's odometer never advances, both-drivers-capped forces one shared restart.
- `hos_engine/tests/test_day_bucketing.py` — every daily log's hours sum to exactly 24.00, midnight-spanning segments split correctly.
- `trips/tests/test_api.py` — valid/invalid payloads, custom cycle schedule validation, clean error handling for geocoding/routing failures (never a bare 500).
- `hos_engine/tests/test_exceptions.py` — short-haul / 16-hour eligibility audits.
- `hos_engine/tests/test_routing.py` — per-leg distance limits and off-road snapping.

**Frontend** — `cd frontend && npm test` — **15 tests** (vitest) in `src/model/tripPlan.test.ts`: Total trip vs. Days consistency, cycle recap derived from the last log, every day's totals sum to 24 h, restart labels follow the trip's own restart length, review issues and their fixes (`applyIssueFix`), formatting, and per-day route slicing for the map.

## Demo

A walkthrough script for recording a demo lives in [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md). The UX changes and the reasoning behind each are in [frontend/CHANGELOG.md](frontend/CHANGELOG.md).

## Deployment

Both free, both **no credit card required** — [verified current as of this deploy](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026).

**Backend → [Render](https://render.com)**: connect the repo, root directory `backend`. Render should auto-detect `render.yaml`; if it doesn't, set the **Build Command** explicitly to
```
pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate
```
and the **Start Command** to
```
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
```
(Skipping the `collectstatic && migrate` half is the single most common way this deploy silently breaks — the symptom is a `django.db.utils.OperationalError: no such table` on every write.) The Python version is pinned via `backend/.python-version` (3.12) — without it, Render may default to a much newer, less-tested interpreter. Set `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_ORIGIN_REGEX`, and `ORS_API_KEY` in Render's dashboard (left blank in `render.yaml` via `sync: false` so they're never committed). Free-tier services spin down after 15 minutes idle and take ~30–60s to wake — the frontend's loading state already accounts for this.

**Frontend → [Vercel](https://vercel.com)**: connect the repo, root directory `frontend`. Set `VITE_API_BASE_URL` to the deployed Render URL **without a trailing slash** (the client code appends its own `/api/...`, so a trailing slash produces a `//api/...` path that 404s). The `VITE_` prefix is required — Vite only inlines env vars into the client bundle when they carry it — and this value is meant to be public, so Vercel's "public prefix" warning is expected and safe to accept.

**Known limitation:** the free tiers use SQLite with no persistent disk, so the database resets on every redeploy. That's a fine tradeoff here — the app's value is live per-trip computation, not trip history.

## Design

See [DESIGN.md](DESIGN.md) for the visual system and the reasoning behind it, and [PRODUCT.md](PRODUCT.md) for the product context and principles.
