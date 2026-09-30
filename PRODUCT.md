# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Django (backend) + React/TypeScript (frontend) — mandated by the take-home assessment brief that commissioned this build, not a design decision.

## Users

Primary user (confirmed with the user): a dispatcher or back-office planner at a trucking/logistics company, planning a driver's trip on the driver's behalf — not the driver entering their own trip. They enter a driver's current location, pickup location, dropoff location, and the driver's current 70-hour/8-day cycle hours used, then review the resulting route and FMCSA-compliant daily log sheets before or after the trip runs.

## Product Purpose

Takes trip parameters and produces two things a dispatcher needs to plan and validate a compliant interstate trip: a route map with required stops (fuel, mandatory breaks, rest periods, restarts), and pre-filled FMCSA "Driver's Daily Log" sheets accurate enough to satisfy a DOT roadside inspection or audit. Success = a dispatcher can trust the output without redoing the Part 395 math by hand.

## Positioning

[Inferred from the assessment brief, not separately confirmed] A focused, accuracy-first HOS/ELD trip-compliance calculator — narrower than a full TMS or ELD provider platform, but demonstrating the core compliance-calculation mechanism those larger systems depend on.

## Operating Context

Used at a dispatcher's desk (desktop-primary, but should stay usable on a tablet/narrow viewport), likely alongside other back-office tools (TMS, ELD provider dashboards). Single-session tool: plan one trip, review the route and logs, then dispatch or adjust inputs and re-plan. Scope, per the assessment's own stated assumptions: solo driver, property-carrying, 70-hour/8-day cycle only; no adverse-driving-conditions exception; fueling assumed every 1,000 miles; 1 hour each for pickup and dropoff.

## Capabilities and Constraints

- Inputs: current location, pickup location, dropoff location (free-text addresses, geocoded server-side), current cycle hours used (0-70).
- Outputs: an interactive route map (current/pickup/dropoff/fuel/break/rest/restart stop markers) and one FMCSA Driver's Daily Log sheet per calendar day of the trip (24-hour grid, 4 duty-status rows, remarks strip, totals column).
- No user accounts or auth — single-tenant assessment build, not a multi-dispatcher production system.
- No trip history/dashboard in current scope — each visit plans one trip.

## Evidence on Hand

None. No existing screenshots, brand assets, or dispatcher feedback — this is a from-scratch build for a take-home technical assessment, not a live product with users yet.

## Product Principles

1. Accuracy of the compliance math is the non-negotiable core; visual polish supports trust in that accuracy, never substitutes for it.
2. Read as an operational tool a dispatcher would rely on daily — not a marketing demo, not a consumer app.
3. The FMCSA log sheet's data structure and layout semantics are fixed (regulatory-accurate); only its visual treatment is open to design.
4. Keep the surface lean — one focused task (plan and review one trip) done well, not a sprawling feature set.

## Accessibility & Inclusion

No specific standard mandated by the assessment brief. Default to solid baseline practice (keyboard-operable tabs, sufficient color contrast, readable at standard zoom) since a dispatcher-facing operational tool shouldn't assume perfect vision or mouse-only use.
