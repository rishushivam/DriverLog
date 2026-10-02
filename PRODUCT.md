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
- The 60-hour/7-day and 70-hour/8-day limits are enforced as a true rolling window (49 CFR §395.3(b)): the oldest day's on-duty hours drop off the trailing window as each new day begins, independent of whether a 34-hour restart ever happens. The dispatcher-facing input is a single flat "current cycle hours used" number, not a real day-by-day trailing history, so that whole pre-trip total is attributed to one notional day — the trip's own start date. This is the most conservative placement possible: it keeps those hours counted for as long as the rolling window ever could, so the simplification only ever makes the engine *more* cautious (never less) relative to a dispatcher who could supply the real per-day breakdown. When the cap binds, the engine takes whichever is sooner: waiting for older hours to age off at a coming midnight (the regulation's own alternative) or the optional 34-hour restart. Only *driving* is gated on the cap — on-duty-not-driving work (pickup, dropoff, fuel) may exceed it, as the regulation allows.
- The driver's duty period already in progress at submit time is an input ("hours driven today" / "hours on duty today" since the last 10-hour rest), defaulting to a fresh clock. On a team trip it describes driver 1; the co-driver is assumed rested.
- Team driving logs the resting driver per the FMCSA guide's team pattern: 7 consecutive hours in the sleeper berth, up to 3 hours off duty in the passenger seat, then back in the berth.
- Short-haul exceptions (§395.1(e)(1) CDL and (e)(2) non-CDL) and the 16-hour exception (§395.1(o)) are inputs. Each requires a return leg to the work reporting location. The engine plans under the exception's relaxed daily rules (no 30-minute break; 14-hour release for CDL; driving to the 14th or, on 2 days per 7, the 16th hour for non-CDL; a 16-hour window once per 7 days under §395.1(o)), then judges the finished plan the way an auditor would (150 air-mile radius over every route vertex, one duty period, release or last-driving time within the limit). A plan that fails is re-made under §395.3 and the failed tests are reported; an eligible short-haul day is logged as a time record (report time, on-duty hours, release time) in place of a RODS.
- The §395.1(g) sleeper-berth split is deliberately not used: for a planner that drives until a limit binds it never beats a plain 10-hour reset.

## Evidence on Hand

None. No existing screenshots, brand assets, or dispatcher feedback — this is a from-scratch build for a take-home technical assessment, not a live product with users yet.

## Product Principles

1. Accuracy of the compliance math is the non-negotiable core; visual polish supports trust in that accuracy, never substitutes for it.
2. Read as an operational tool a dispatcher would rely on daily — not a marketing demo, not a consumer app.
3. The FMCSA log sheet's data structure and layout semantics are fixed (regulatory-accurate); only its visual treatment is open to design.
4. Keep the surface lean — one focused task (plan and review one trip) done well, not a sprawling feature set.

## Accessibility & Inclusion

No specific standard mandated by the assessment brief. Default to solid baseline practice (keyboard-operable tabs, sufficient color contrast, readable at standard zoom) since a dispatcher-facing operational tool shouldn't assume perfect vision or mouse-only use.
