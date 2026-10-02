import L from "leaflet"
import type { LatLngExpression, Polyline as LeafletPolyline } from "leaflet"
import { Expand, LocateFixed, Minimize } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MapContainer, Marker, Pane, Polyline, Popup, TileLayer, useMap } from "react-leaflet"
import type { RouteStop, StopType, TripRoute } from "../../api/types"
import { STOP_COLORS, STOP_ICONS, STOP_LABELS, STOP_ORDER, restartLabel } from "../../config/stopTypes"
import type { Theme } from "../../hooks/useTheme"
import { useUnits } from "../../hooks/useUnits"
import { formatDayLabel, formatDistance } from "../../model/format"
import { dayColor, fullRouteLine, overlapOffsets, splitRouteByDay } from "../../model/routeGeometry"
import type { PlanDay } from "../../model/tripPlan"
import { Tooltip } from "../ui/Tooltip"

function toLatLng([lng, lat]: [number, number]): LatLngExpression {
  return [lat, lng]
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

const MAX_MARKER_STAGGER_MS = 600
const MARKER_SIZE = 30

/** Shape + colour + icon per stop type, so no marker relies on colour
 * alone; the running number ties it to the timeline's order. */
const MARKER_SHAPE: Record<StopType, "circle" | "square" | "diamond" | "pin" | "hex"> = {
  current: "circle",
  pickup: "square",
  dropoff: "pin",
  fuel: "hex",
  break: "circle",
  rest: "diamond",
  restart: "diamond",
  cycle_wait: "hex",
  return: "square",
}

function stopIcon(type: StopType, n: number, delayMs: number, active: boolean, offset: [number, number]) {
  const color = STOP_COLORS[type]
  const Icon = STOP_ICONS[type]
  const svg = renderToStaticMarkup(<Icon size={15} strokeWidth={2.5} color="white" aria-hidden="true" />)
  const html = `<div class="marker-pop" style="animation-delay:${delayMs}ms"><div class="map-marker map-marker--${MARKER_SHAPE[type]}" data-active="${active}" style="background:${color};--marker-ring:${color}55">${svg}<span class="map-marker-n">${n}</span></div></div>`
  return L.divIcon({
    className: "",
    html,
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2 - offset[0], MARKER_SIZE / 2 - offset[1]],
    popupAnchor: [offset[0], -MARKER_SIZE / 2 + offset[1]],
  })
}

function FitBounds({ positions, trigger }: { positions: LatLngExpression[]; trigger: number }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length === 0) return
    map.fitBounds(positions as [number, number][], { padding: [48, 48], animate: trigger > 0 && !prefersReducedMotion() })
  }, [map, positions, trigger])
  return null
}

function InvalidateOnResize({ token }: { token: number }) {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 60)
    return () => clearTimeout(id)
  }, [map, token])
  return null
}

/** Draws in rather than appearing instantly — the same drawing-a-line idea
 * as the log sheet's status path. */
function AnimatedPolyline({ positions, color, weight = 6 }: { positions: LatLngExpression[]; color: string; weight?: number }) {
  const ref = useRef<LeafletPolyline | null>(null)
  useEffect(() => {
    const polyline = ref.current
    if (!polyline) return
    const path = polyline.getElement() as SVGPathElement | null
    if (!path) return
    if (prefersReducedMotion()) {
      path.style.strokeDasharray = "none"
      return
    }
    const length = path.getTotalLength()
    path.style.transition = "none"
    path.style.strokeDasharray = `${length}`
    path.style.strokeDashoffset = `${length}`
    path.getBoundingClientRect()
    path.style.transition = "stroke-dashoffset 1100ms cubic-bezier(0.16, 1, 0.3, 1)"
    path.style.strokeDashoffset = "0"
  }, [positions])
  return <Polyline ref={ref} positions={positions} pathOptions={{ color, weight, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
}

function PanToActive({ position }: { position: LatLngExpression | null }) {
  const map = useMap()
  useEffect(() => {
    if (!position) return
    map.panTo(position, { animate: !prefersReducedMotion(), duration: 0.4 })
  }, [map, position])
  return null
}

interface Props {
  route: TripRoute
  days: PlanDay[]
  /** Parallel to `route.stops` — the trip-segment index each marker
   * corresponds to (`null` for the current-location marker). */
  stopSegmentIndices: (number | null)[]
  activeSegmentIndex: number | null
  onSelectStop: (segmentIndex: number) => void
  onHoverStop: (segmentIndex: number | null) => void
  theme: Theme
  restartHours: number
}

/** Esri's canvas basemaps: muted light/dark grounds with English labels,
 * no API key. Base + reference (labels) layers, so the route line sits
 * under the place names. */
const TILES = {
  light: {
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
  dark: {
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
}
const TILE_ATTRIBUTION = "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors"

export function RouteMap({ route, days, stopSegmentIndices, activeSegmentIndex, onSelectStop, onHoverStop, theme, restartHours }: Props) {
  const { units } = useUnits()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [fitTrigger, setFitTrigger] = useState(0)
  const [hidden, setHidden] = useState<Set<StopType>>(new Set())

  const routeLine = useMemo(() => fullRouteLine(route).map(toLatLng), [route])
  const dayLines = useMemo(() => splitRouteByDay(route, days), [route, days])
  const offsets = useMemo(() => overlapOffsets(route.stops.map((s) => s.coords)), [route.stops])
  const usedTypes = new Set(route.stops.map((s) => s.type))
  const labelFor = (type: StopType) => (type === "restart" ? restartLabel(restartHours) : STOP_LABELS[type])

  const activeStopPosition = useMemo(() => {
    if (activeSegmentIndex == null) return null
    const i = stopSegmentIndices.indexOf(activeSegmentIndex)
    return i >= 0 ? toLatLng(route.stops[i].coords) : null
  }, [activeSegmentIndex, stopSegmentIndices, route.stops])

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    if (!fullscreen && el.requestFullscreen) {
      el.requestFullscreen().catch(() => setFullscreen(true))
    } else if (fullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => setFullscreen(false))
    } else {
      setFullscreen((f) => !f)
    }
  }, [fullscreen])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapperRef.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && setFullscreen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [fullscreen])

  const toggleType = (type: StopType) =>
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })

  return (
    <div>
      <div ref={wrapperRef} className={`relative h-[340px] w-full overflow-hidden rounded-2xl border border-line bg-surface-3 shadow-[var(--shadow-2)] sm:h-[420px] xl:h-[560px] ${fullscreen ? "map-fullscreen" : ""}`}>
        <MapContainer center={toLatLng(route.current_location_coords)} zoom={6} scrollWheelZoom={fullscreen} className="h-full w-full" attributionControl>
          <TileLayer key={`${theme}-base`} attribution={TILE_ATTRIBUTION} url={TILES[theme].base} maxZoom={16} />
          <Pane name="labels" style={{ zIndex: 450, pointerEvents: "none" }}>
            <TileLayer key={`${theme}-labels`} url={TILES[theme].labels} maxZoom={16} />
          </Pane>
          {dayLines.length > 1 ? (
            dayLines.map((d) => <AnimatedPolyline key={d.dayIndex} positions={d.positions} color={dayColor(d.dayIndex)} />)
          ) : (
            <AnimatedPolyline positions={routeLine} color={dayColor(0)} />
          )}
          {route.stops.map((stop: RouteStop, i: number) => {
            if (hidden.has(stop.type)) return null
            const segmentIndex = stopSegmentIndices[i] ?? null
            const isActive = segmentIndex != null && segmentIndex === activeSegmentIndex
            return (
              <Marker
                key={`${stop.type}-${i}`}
                position={toLatLng(stop.coords)}
                icon={stopIcon(stop.type, i + 1, Math.min(i * 70, MAX_MARKER_STAGGER_MS), isActive, offsets[i])}
                zIndexOffset={isActive ? 1000 : 0}
                alt={`${i + 1}. ${labelFor(stop.type)}: ${stop.label}`}
                eventHandlers={
                  segmentIndex != null
                    ? {
                        click: () => onSelectStop(segmentIndex),
                        mouseover: () => onHoverStop(segmentIndex),
                        mouseout: () => onHoverStop(null),
                      }
                    : undefined
                }
              >
                <Popup>
                  <strong>
                    {i + 1}. {labelFor(stop.type)}
                  </strong>
                  <div>{stop.label}</div>
                </Popup>
              </Marker>
            )
          })}
          <FitBounds positions={routeLine} trigger={fitTrigger} />
          <PanToActive position={activeStopPosition} />
          <InvalidateOnResize token={fullscreen ? 1 : 0} />
        </MapContainer>

        <div className="absolute top-3 right-3 z-[500] flex flex-col gap-1.5">
          <Tooltip label="Recenter on route" side="left">
            <button type="button" onClick={() => setFitTrigger((t) => t + 1)} aria-label="Recenter on route" className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 shadow-[var(--shadow-1)] hover:text-ink">
              <LocateFixed size={16} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label={fullscreen ? "Exit fullscreen" : "Fullscreen"} side="left">
            <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen map" : "Fullscreen map"} aria-pressed={fullscreen} className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 shadow-[var(--shadow-1)] hover:text-ink">
              {fullscreen ? <Minimize size={16} aria-hidden="true" /> : <Expand size={16} aria-hidden="true" />}
            </button>
          </Tooltip>
        </div>

        {dayLines.length > 1 && (
          <div className="absolute bottom-6 left-3 z-[500] flex flex-wrap gap-1.5 rounded-lg border border-line bg-surface/90 px-2 py-1.5 text-xs text-ink-2 backdrop-blur" aria-label="Route colour by day">
            {days
              .filter((d) => d.odometerEnd > d.odometerStart)
              .map((d) => (
                <span key={d.index} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full" style={{ backgroundColor: dayColor(d.index) }} aria-hidden="true" />
                  Day {d.index + 1} <span className="text-ink-3">{formatDayLabel(d.date)}</span> · <span className="num">{formatDistance(d.miles, units)}</span>
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Legend as a filter: each chip toggles that stop type's markers. */}
      <div className="mt-3 flex flex-wrap gap-1.5 px-1" role="group" aria-label="Filter stop types on the map">
        {STOP_ORDER.filter((type) => usedTypes.has(type)).map((type) => {
          const Icon = STOP_ICONS[type]
          const off = hidden.has(type)
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              aria-pressed={!off}
              className={`focus-ring flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${off ? "border-line bg-surface text-ink-3 line-through" : "border-line-strong bg-surface-2 text-ink"}`}
            >
              <span className={`map-marker map-marker--${MARKER_SHAPE[type]} !h-4 !w-4 !border-[1.5px] !shadow-none`} style={{ backgroundColor: off ? "var(--line-strong)" : STOP_COLORS[type] }} aria-hidden="true">
                <Icon size={9} strokeWidth={3} />
              </span>
              {labelFor(type)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
