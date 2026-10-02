import { ArrowUpDown, Flag, GripVertical, Home, MapPin, PackageCheck, Plus, X } from "lucide-react"
import { useState } from "react"
import { Tooltip } from "../ui/Tooltip"
import { LocationField } from "./LocationField"

export type StopKey = "current_location" | "pickup_location" | "dropoff_location"
export interface StopValue {
  value: string
  geocoded: boolean
}

interface Props {
  uid: string
  stops: Record<StopKey, StopValue>
  onStopChange: (key: StopKey, value: string, geocoded: boolean) => void
  /** Moves the address at `from` to `to`, shifting the others. The three
   * roles (current → pickup → dropoff) are fixed by the HOS engine; reordering
   * changes which address fills which role. */
  onReorder: (from: number, to: number) => void
  errors: Partial<Record<StopKey, string>>
  returnLeg: { enabled: boolean; value: string; geocoded: boolean; error?: string }
  onReturnLegChange: (next: { enabled?: boolean; value?: string; geocoded?: boolean }) => void
  /** The return leg is mandatory for short-haul and the 16-hour exception. */
  returnLegRequired: boolean
}

const ORDER: Array<{ key: StopKey; label: string; icon: typeof MapPin; color: string }> = [
  { key: "current_location", label: "Current location", icon: MapPin, color: "text-ink" },
  { key: "pickup_location", label: "Pickup", icon: PackageCheck, color: "text-success" },
  { key: "dropoff_location", label: "Dropoff", icon: Flag, color: "text-danger" },
]

/** The three route points with drag-handle reordering (mouse) and
 * Alt+Arrow reordering (keyboard), per-row clear, a swap shortcut for the
 * common "I typed them backwards" case, and an optional return-to-base leg
 * added with "Add stop". */
export function RouteStops({ uid, stops, onStopChange, onReorder, errors, returnLeg, onReturnLegChange, returnLegRequired }: Props) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  function onKeyReorder(e: React.KeyboardEvent, index: number) {
    if (!e.altKey) return
    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault()
      onReorder(index, index - 1)
    } else if (e.key === "ArrowDown" && index < ORDER.length - 1) {
      e.preventDefault()
      onReorder(index, index + 1)
    }
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-3" aria-label="Route stops in order">
        {ORDER.map((row, index) => {
          const Icon = row.icon
          const isOver = over === index && dragging !== null && dragging !== index
          return (
            <li
              key={row.key}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(index)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragging !== null && dragging !== index) onReorder(dragging, index)
                setDragging(null)
                setOver(null)
              }}
              className={`flex items-stretch gap-2 rounded-xl transition-[box-shadow] duration-150 ${isOver ? "shadow-[0_0_0_2px_var(--accent)]" : ""}`}
            >
              <div className="flex w-9 shrink-0 flex-col items-center justify-center gap-1">
                <Icon size={15} strokeWidth={2.5} className={row.color} aria-hidden="true" />
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move"
                    setDragging(index)
                  }}
                  onDragEnd={() => {
                    setDragging(null)
                    setOver(null)
                  }}
                  onKeyDown={(e) => onKeyReorder(e, index)}
                  aria-label={`Reorder ${row.label}. Drag, or press Alt plus Arrow Up or Down.`}
                  className="focus-ring cursor-grab rounded-md p-1 text-ink-3 hover:bg-surface-3 hover:text-ink active:cursor-grabbing"
                >
                  <GripVertical size={14} aria-hidden="true" />
                </button>
              </div>
              <LocationField
                id={`${uid}-${row.key}`}
                label={row.label}
                value={stops[row.key].value}
                geocoded={stops[row.key].geocoded}
                onChange={(v, g) => onStopChange(row.key, v, g)}
                error={errors[row.key]}
              />
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2 pl-11">
        <Tooltip label="Swap pickup and dropoff">
          <button type="button" onClick={() => onReorder(2, 1)} className="btn btn-ghost focus-ring h-8 gap-1.5 px-2.5 text-[13px]">
            <ArrowUpDown size={14} aria-hidden="true" />
            Swap
          </button>
        </Tooltip>
        {!returnLeg.enabled && (
          <button type="button" onClick={() => onReturnLegChange({ enabled: true })} className="btn btn-ghost focus-ring h-8 gap-1.5 px-2.5 text-[13px]">
            <Plus size={14} aria-hidden="true" />
            Add stop
            <span className="text-ink-3">(return to base)</span>
          </button>
        )}
      </div>

      {returnLeg.enabled && (
        <div className="flex items-stretch gap-2">
          <div className="flex w-9 shrink-0 flex-col items-center justify-center">
            <Home size={15} strokeWidth={2.5} className="text-info" aria-hidden="true" />
          </div>
          <LocationField
            id={`${uid}-base`}
            label="Return to work reporting location"
            value={returnLeg.value}
            geocoded={returnLeg.geocoded}
            onChange={(v, g) => onReturnLegChange({ value: v, geocoded: g })}
            error={returnLeg.error}
            hint={returnLeg.value ? undefined : "Leave blank to return to the current location."}
          />
          {!returnLegRequired && (
            <button
              type="button"
              onClick={() => onReturnLegChange({ enabled: false, value: "", geocoded: false })}
              aria-label="Remove the return leg"
              className="focus-ring mt-2 h-8 w-8 shrink-0 self-start rounded-md text-ink-3 hover:bg-surface-3 hover:text-ink"
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
