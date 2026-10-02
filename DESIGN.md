# Design

<!-- impeccable:design-schema 1 -->

## World

"Calm instrument, warm accent." A two-pane operating surface for a dispatcher: a compact, sticky trip form on the left and an independently scrolling results pane on the right (a bottom sheet over full-screen results on phones). Neutral warm-grey surfaces carry the data; one amber accent carries every primary action, active state and the route line. The FMCSA Driver's Daily Log keeps its paper-white, ink-black document look in both themes, because it is a printed form, not a widget. This replaced the earlier "elevated FMCSA paperwork" world (navy bands, ruled-grid watermark) at the user's request for a modern two-pane layout with light and dark modes; product truth, the log sheet's structure and every HOS reason string were preserved.

## Tokens

- **Color** — semantic CSS variables in `src/index.css`, exposed to Tailwind v4 via `@theme`: `canvas`, `surface`, `surface-2`, `surface-3`, `line`, `line-strong`, `ink`, `ink-2`, `ink-3`, `accent`, `accent-ink`, `accent-soft`, plus a 50–900 `accent-*` amber scale. Light values are warm off-whites (`#f6f5f2` canvas); dark values are blue-black (`#0f1115` canvas) with a brighter amber (`#f5a623`). Dark mode is class-based (`.dark` on `<html>`, `@custom-variant dark`), set before first paint by an inline script and persisted in `localStorage` (`eld-theme`). Status colours in `config/stopTypes.ts` mean one thing each: pickup green, dropoff red, fuel teal, break violet, rest blue, restart rose, cycle-wait deep rose, current slate. Amber is never a status colour.
- **Type** — Inter (Google Fonts) for UI; JetBrains Mono via the `.num` utility for every measurement (hours, miles, times, log totals, chip values), always `tabular-nums`. Section headings in the form are 12px uppercase tracked `ink-3`; card titles are 14px semibold.
- **Shape / depth** — `rounded-xl` controls and `rounded-2xl` cards; 1px `line` borders; two shadows only: `--shadow-card` (offset, soft) on cards and `--shadow-pop` on popovers. Focus is a 2px amber outline (`.focus-ring`) or a 4px `accent-soft` halo on focused fields.
- **Spacing** — 8-pt grid; form sections separated by 28px, fields by 12px; results cards by 24px.
- **Motion** — Framer Motion, one easing family (`EASE_OUT` = cubic-bezier(0.16,1,0.3,1)) in `components/ui/motion.ts`. Authored moments: results cards slide up 8px and fade with a 70ms stagger (`rise`/`stagger`); the route timeline's steps draw in top-to-bottom; progressive disclosure animates height + fade (`Reveal`); segmented controls and tabs share a sliding indicator (`layoutId`); invalid fields shake once; chips and buttons press to 0.98. Pre-existing draw-ins kept: the log sheet's status path and the map polyline trace themselves in. Every animation respects `prefers-reduced-motion`.
- **Browser surfaces** — `::selection` in amber; `.scroll-thin` themed scrollbars on every owned scroll region; a themed range slider (`.cycle-range`); Leaflet popups, zoom controls and attribution restyled; OSM tiles inverted and desaturated in dark mode (`.tiles-dark`).

## Components

- `ui/Field` — floating-label input with inline validation (red helper + shake, green check when valid, optional unit suffix).
- `ui/Chip` — a filled default rendered as a value chip with a "Change" affordance; `ui/Reveal` animates the control it opens.
- `ui/SegmentedControl` — radio group with a sliding amber indicator; used for 1 vs 2 drivers and the cycle schedule.
- `TripForm/CycleSlider` — slider + number input sharing one value, with "N hrs remaining of cap" read live.
- `TripForm/LocationField` — floating-label combobox with debounced autocomplete; three of them sit on an Origin → Pickup → Dropoff dot-and-line connector.
- `layout/BottomSheet` — phone container for the form: collapsed 64px bar with the trip summary, drag-to-dismiss sheet when open.
- `layout/SummaryStrip` — four figures plus the compliance badge; "Needs review" names its reasons (restart, cycle wait, >5 days, mid-shift driver) under the strip.
- `TripWorkspace/RouteTimeline` — vertical stepper of drive legs and required stops with time windows and HOS reasons; hover/selection shared with the map and the log grid.
- `LogSheetContainer` — day tabs (arrow keys move between them), Copy (plain-text log to clipboard) and Export PDF (print), one sheet per day per driver when printing.
- `ELDLogSheet` — unchanged SVG recreation of the RODS grid; paper-white in both themes, amber highlight marker for the hovered event.
- `ui/Skeleton` / `ResultsSkeleton` — shimmer placeholders while the backend plans.

## Verification

Inspected live in the Browser pane against the bundled example trip (produced by the real engine): desktop light and dark, phone (375px) light and dark including the collapsed sheet, example-loading, scroll, map tiles, timeline and both log days. `tsc` and `vite build` pass. Not exercised in this pass: a live API submit (ORS key), print preview, and screen-reader runs; the structure is ARIA-labelled (tabs, radiogroups, combobox, dialog) but unverified with assistive tech.
