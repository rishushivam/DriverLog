# Changelog — UX refactor

Scope: React + Vite frontend, plus one small backend endpoint (reverse geocoding). The HOS engine (`backend/hos_engine/`) is untouched; every figure the UI shows is still the engine's own output, now derived once in `src/model/tripPlan.ts`.

## File structure

```
src/
  model/            ← new: presentation facts derived from the API response
    tripPlan.ts        ONE computed plan: days, elapsed, cycle recap, issues, fixes
    tripPlan.test.ts   unit tests for the data-consistency fixes (vitest)
    format.ts          every date / time / duration / distance format
    routeGeometry.ts   per-day route slicing, marker overlap offsets, day colours
  hooks/
    useTheme.ts        light / dark / system
    useSidebar.ts      collapsed state + "[" shortcut (localStorage)
    useUnits.ts        mi / km context, locale default
    useRecentTrips.ts  recent trips + share-link encode/decode
    usePlaceName.ts    reverse-geocode cache (memory + localStorage)
    useScrollSpy.ts    active section for the sticky sub-nav
    useLocalStorage.ts, useMediaQuery.ts, useTripPlanner.ts (retry/reset/request kept)
  components/
    layout/           Header, Sidebar (rail / drawer), SectionNav, EmptyState, ErrorBanner, TabButton
    ui/               Button, IconButton, Tooltip, Collapsible, Switch, ProgressBar, SegmentedControl,
                      Field, Reveal, Skeleton, ThemeToggle, Toast
    TripForm/         TripForm (collapsible sections + sticky action bar), formState (pure validate/to/from request),
                      RouteStops (drag / Alt+Arrow reorder, swap, add return leg), LocationField, CycleSlider
    TripWorkspace/    TripWorkspace, SummaryCard, ReviewPanel, RouteTimeline
    RouteMap/         RouteMap (Esri canvas tiles, numbered shaped markers, day-coloured line, legend filter)
    LogSheetContainer/, ELDLogSheet/  paper frame, day tabs, actions, editable fields
```

Removed: `ui/Chip.tsx` (the "Change / Done" chips), `layout/BottomSheet.tsx` (replaced by the drawer), `layout/SummaryStrip.tsx` (now `SummaryCard`), `utils/tripSegments.ts` (folded into `model/`).

## 1. Layout & navigation

| Problem | Fix |
|---|---|
| Sidebar was fixed-width and could not be hidden; results pane was cramped on laptops. | Sidebar collapses to a 64 px icon rail (header button or `[`), persisted in localStorage. Rail icons open the form at that section with a tooltip. |
| Below 1024 px the form was a bottom sheet that fought with the results for space. | It is now an overlay drawer with backdrop, close button, Escape, and body-scroll lock. |
| Submit button scrolled away; no reset. | Sidebar header is sticky; a sticky bottom action bar holds **Plan trip** (disabled while invalid, spinner while planning) and **Reset**. |
| No way to jump between Summary / Map / Logs on a long page. | Sticky segmented sub-nav (Summary · Map & Timeline · Daily Logs) with smooth scroll and scroll-spy highlighting. |
| Map/timeline split was an ad-hoc `1.35fr 1fr`. | 12-column grid: map 8 / timeline 4 at ≥1280 px, stacked below. |

## 2. Sidebar form

| Problem | Fix |
|---|---|
| Flat list of fields with "Change ⌄ / Done" chips that hid controls. | Four collapsible sections (Driver, Route, Hours & Cycle, Rules & exceptions); each shows a one-line summary when collapsed. The first invalid section opens on submit. |
| Two places to set the restart duration, with a confusing "Done" label. | One control: a **Custom restart duration** switch; the number input only appears when it is on. Off sends the regulation's 34 h. *(The brief suggested "Include 34-hr restart"; the engine cannot disable restarts, so the switch is named for what it actually does.)* |
| "Drivers → Solo driver" chip with a Change link. | **Crew: Solo / Team** segmented control. |
| Cycle schedule behind a "Change ⌄" link. | Segmented control (70 hr / 8 day · 60 hr / 7 day · Custom). |
| Cycle hours: slider and number drifted; no thresholds. | Shared value with min/max/step and units; remaining hours shown as a meter with green / amber / red thresholds (<70 / 70–90 / >90 %) **and** a word ("Plenty left", "Getting tight", "Nearly exhausted") so colour is never the only signal. Inline validation message. |
| Route inputs had an always-green check and no way to clear or reorder. | Check only after an address is picked from the geocoder; × clears; drag handle (mouse) or Alt+↑/↓ (keyboard) reorders; **Swap** flips pickup/dropoff; **Add stop** adds the return-to-base leg the engine supports. Error state turns the border red and announces the message. |
| Moon-icon toggle with no label. | Labeled **Light / Dark / System** segmented control with a clear active state; "System" follows `prefers-color-scheme` live. |

## 3. Summary card & data consistency

| Problem | Fix |
|---|---|
| "Total trip" and "Days" could read as contradicting each other. | Defined once: **Total trip** = elapsed wall-clock time (first to last duty segment); **Days** = calendar days touched (one log each). Both have tooltips. |
| Sidebar cycle hours, restart, timeline and recap each re-derived figures. | `buildTripPlan()` derives everything once; the sidebar "After this trip" meter, summary, timeline day headers, map day colours and log tabs all read from it. Unit tests cover elapsed vs. days, cycle recap from the last log, 24 h day totals, restart label from `restart_hours`, odometer ranges. |
| "Needs review" was a tooltip. | Clicking opens a panel listing each issue with a one-sentence explanation and, where possible, a fix button: **Start with a fresh 10-hr rest** (re-plans with today's hours zeroed) and **Optimize schedule** (re-plans with an earlier departure). Fixes are pure functions (`applyIssueFix`) and unit-tested. |
| Miles only; dates as `2026-10-02`. | mi / km toggle (locale default, persisted). One date format everywhere ("Fri, Oct 2"), and the summary shows departure/arrival with the timezone the trip was anchored to. |
| Very short final day went unnoticed. | Warning when the last day has <2 h driving, with the Optimize action. |

## 4. Map

| Problem | Fix |
|---|---|
| Inverted OSM tiles in dark mode (mixed scripts, muddy colours). | Esri Light/Dark Gray canvas tiles (English labels, no key) with a separate labels pane so the route sits under place names. CARTO was tried first and now watermarks "API KEY REQUIRED". |
| Tiny colour-only dots. | 30 px markers with a distinct **shape + colour + icon** per type and a running number that matches the timeline. Markers sharing a coordinate (break at the pickup) are spread in a small ring so each stays clickable. |
| One thin line; no way to recover the view. | Thicker line coloured per day (with an in-map key), `fitBounds` with padding, **Recenter** and **Fullscreen** buttons. |
| One-way hover link. | Hover/click on a timeline row pans to and highlights the marker; clicking a marker scrolls the timeline to that stop and switches the log day. |
| Legend was colour-only decoration. | Compact chips with shape + icon + label that toggle each stop type's markers. |

## 5. Route timeline

| Problem | Fix |
|---|---|
| "En route, mile 110" told nobody where that is. | Nearest town via a new `/api/geocode-reverse/` proxy ("Near Murfreesboro, TN"), cached in memory and localStorage; the mile/km marker becomes the secondary line. |
| Days were plain labels. | Collapsible day groups with sticky headers showing drive h, on-duty h and distance, plus a drive / on-duty / rest bar per day. |
| Card clipped its bottom. | Internal scroll with fade edges and a sensible max height; grows naturally on mobile. |

## 6. Daily log sheet

| Problem | Fix |
|---|---|
| Sheet floated on the dark canvas. | Framed "paper" container with shadow and ring; **Match theme** swaps the paper palette for the app surface. Print always forces paper via `@media print`, so exports are unchanged. |
| Small row labels, uneven line weights, stray tick marks under the grid. | 11 px row labels, three consistent line tiers (hour / half / quarter), remark ticks removed (remarks are listed below), hover tooltip kept. |
| Totals column had no visible sum. | A "= 24 h" row shows the sum (red if it ever isn't 24.00) and a confirmation line under the recap. |
| Blank ruled fields. | Shipping documents, DVL/manifest no. and shipper & commodity are inputs with placeholders; values are kept per day and included in "Copy as text". |
| Both 70-hr and 60-hr recap blocks always rendered. | Only the block for the trip's schedule is shown (custom gets its own). |
| Day tabs showed only a date. | Status dot (OK / warning), the day's driving hours, prev/next arrows, Home/End keys. |
| "Copy" / "Export PDF" with no feedback. | **Copy as text**, **Export PDF**, **Print** with toast confirmations and a loading state. |

## 7. Design system

Tokens in `index.css`: 8-pt spacing scale, radius scale (sm–2xl), three elevation levels, neutral surfaces + amber accent + semantic success / warning / danger / info (light and dark). One family (Inter) everywhere; figures use `tabular-nums` via `.num` instead of switching to a monospace font. Type scale 12 / 14 / 16 / 20 / 28; body and helper text are 13–14 px. Secondary text brightened to ≥6:1 contrast in both themes. Shared `.card`, `.btn-*` states and 150–200 ms transitions; skeleton loaders for the results pane.

## 8. Accessibility & responsiveness

Icon buttons carry `aria-label`s and tooltips; collapsibles use `aria-expanded`/`aria-controls`; day tabs are a `role="tablist"` with arrow/Home/End keys; the map legend uses `aria-pressed`; meters use `role="meter"`; the drawer is a modal dialog; a "Skip to results" link is first in tab order. Stop types and statuses carry icons and words, never colour alone. `prefers-reduced-motion` disables animations and smooth scrolling; `prefers-color-scheme` drives the System theme. Verified at 360, 768, 1024, 1440 and 1920 px.

## 9. States & polish

Skeletons while planning (with a "server waking up" note after 13 s), an "Enter a route to generate your plan" empty state, error banner with **Retry** for network/server failures, toasts for success and failure. **Share** copies a link that encodes the trip inputs in the URL hash (opening it re-plans the trip); the last eight trips are listed under Route as **Recent trips**.

## Tests

`npm test` runs vitest: 15 tests in `src/model/tripPlan.test.ts` covering the section-3 consistency fixes, issue fixes, formatting and route slicing.
