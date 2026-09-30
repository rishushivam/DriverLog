import { useEffect, useRef } from "react"
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import type { LatLngExpression, Polyline as LeafletPolyline } from "leaflet"
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png"
import markerIcon from "leaflet/dist/images/marker-icon.png"
import markerShadow from "leaflet/dist/images/marker-shadow.png"
import type { RouteStop, StopType, TripRoute } from "../../api/types"
import { STOP_COLORS, STOP_LABELS, STOP_ORDER, restartLabel } from "../../config/stopTypes"

// Leaflet's default marker icon paths don't resolve under Vite's bundler
// unless re-pointed to the hashed asset URLs explicitly.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

function toLatLng([lng, lat]: [number, number]): LatLngExpression {
  return [lat, lng]
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

const MAX_MARKER_STAGGER_MS = 600

// Fixed at the larger (active) box size regardless of state: Leaflet
// replaces this element outright on every `icon` prop change rather than
// mutating it in place, so the size difference is expressed as a
// `transform: scale()` on a constant-size box — never animating width/
// height, which would otherwise force layout on every marker frame — and
// the anchor point never has to shift between states either.
const MARKER_BOX_SIZE = 20

function stopIcon(type: StopType, delayMs: number, active: boolean) {
  const color = STOP_COLORS[type]
  const dotSize = active ? 20 : 14
  const scale = dotSize / MARKER_BOX_SIZE
  const ring = active ? `0 0 0 4px ${color}33, 0 0 0 1px rgba(0,0,0,0.25)` : "0 0 0 1px rgba(0,0,0,0.25)"
  return L.divIcon({
    className: "",
    html: `<div class="marker-pop" style="--marker-scale:${scale};animation-delay:${delayMs}ms;background:${color};width:${MARKER_BOX_SIZE}px;height:${MARKER_BOX_SIZE}px;border-radius:9999px;border:2px solid white;box-shadow:${ring};transition:box-shadow 150ms ease-out"></div>`,
    iconSize: [MARKER_BOX_SIZE, MARKER_BOX_SIZE],
    iconAnchor: [MARKER_BOX_SIZE / 2, MARKER_BOX_SIZE / 2],
  })
}

function FitBounds({ positions }: { positions: LatLngExpression[] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length === 0) return
    map.fitBounds(positions as [number, number][], { padding: [32, 32] })
  }, [map, positions])
  return null
}

/** The route line traces itself in rather than appearing instantly — the
 * same drawing-a-line idea as the log sheet's status path, so the app reads
 * as one coherent visual idea (routes and timelines are both lines that
 * resolve) rather than two unrelated animation effects. */
function AnimatedPolyline({ positions }: { positions: LatLngExpression[] }) {
  const polylineRef = useRef<LeafletPolyline | null>(null)

  useEffect(() => {
    const polyline = polylineRef.current
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

  return <Polyline ref={polylineRef} positions={positions} pathOptions={{ color: "#1b2a47", weight: 4 }} />
}

interface Props {
  route: TripRoute
  /** Parallel to `route.stops` — the trip-segment index each marker
   * corresponds to (`null` for the current-location marker, which has no
   * segment of its own), so a marker can be compared against the
   * timeline/stops-list selection and highlighted as the same event. */
  stopSegmentIndices?: (number | null)[]
  activeSegmentIndex?: number | null
  onSelectStop?: (segmentIndex: number) => void
  height?: string
  /** Only the "restart" marker/legend label depends on this — a trip can
   * override the regulatory 34-hour default (see `restart_hours` on
   * `TripResponse`). */
  restartHours: number
}

/** Recenters on whichever stop just became active — without this, clicking
 * a timeline row for a stop off the current viewport would highlight a
 * marker the dispatcher can't see. */
function PanToActive({ position }: { position: LatLngExpression | null }) {
  const map = useMap()
  useEffect(() => {
    if (!position) return
    map.panTo(position, { animate: !prefersReducedMotion(), duration: 0.4 })
  }, [map, position])
  return null
}

export function RouteMap({
  route,
  stopSegmentIndices,
  activeSegmentIndex,
  onSelectStop,
  height = "h-[420px]",
  restartHours,
}: Props) {
  const routeLine = [...route.geometry.to_pickup, ...route.geometry.to_dropoff].map(toLatLng)
  const usedTypes = new Set(route.stops.map((s) => s.type))
  const labelFor = (type: StopType) => (type === "restart" ? restartLabel(restartHours) : STOP_LABELS[type])
  const activeStopPosition =
    activeSegmentIndex != null && stopSegmentIndices
      ? (() => {
          const i = stopSegmentIndices.indexOf(activeSegmentIndex)
          return i >= 0 ? toLatLng(route.stops[i].coords) : null
        })()
      : null

  return (
    <div>
      <div className={`${height} w-full overflow-hidden rounded-md border border-slate-300 shadow-sm`}>
        <MapContainer
          center={toLatLng(route.current_location_coords)}
          zoom={6}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <AnimatedPolyline positions={routeLine} />
          {route.stops.map((stop: RouteStop, i: number) => {
            const segmentIndex = stopSegmentIndices?.[i] ?? null
            const isActive = segmentIndex != null && segmentIndex === activeSegmentIndex
            return (
              <Marker
                key={`${stop.type}-${i}`}
                position={toLatLng(stop.coords)}
                icon={stopIcon(stop.type, Math.min(i * 70, MAX_MARKER_STAGGER_MS), isActive)}
                eventHandlers={
                  segmentIndex != null && onSelectStop ? { click: () => onSelectStop(segmentIndex) } : undefined
                }
              >
                <Popup>
                  <strong className="capitalize">{labelFor(stop.type)}</strong>
                  <div>{stop.label}</div>
                </Popup>
              </Marker>
            )
          })}
          <FitBounds positions={routeLine} />
          <PanToActive position={activeStopPosition} />
        </MapContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-3">
        {STOP_ORDER.filter((type) => usedTypes.has(type)).map((type) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full border border-white ring-1 ring-slate-300"
              style={{ backgroundColor: STOP_COLORS[type] }}
            />
            {labelFor(type)}
          </div>
        ))}
      </div>
    </div>
  )
}
