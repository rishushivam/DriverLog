import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, MapPin, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { suggestLocations } from "../../api/geocode"
import type { LocationSuggestion } from "../../api/types"
import { quick, shake } from "../ui/motion"

interface Props {
  id: string
  label: string
  value: string
  onChange: (value: string, geocoded: boolean) => void
  /** True when the value was picked from a geocoder suggestion — the only
   * time a check mark is shown. Typed text is unverified until planned. */
  geocoded: boolean
  error?: string
  hint?: string
  placeholder?: string
}

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3

/** Floating-label combobox backed by the backend's ORS autocomplete proxy
 * (trips/views.py::geocode_suggest). Debounced and abortable so a fast
 * typist never queues stale requests; a stale response landing after focus
 * has moved on never reopens the list. */
export function LocationField({ id, label, value, onChange, geocoded, error, hint }: Props) {
  const reduced = useReducedMotion()
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    },
    [],
  )

  function fetchSuggestions(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setIsOpen(false)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      const results = await suggestLocations(query, controller.signal)
      if (controller.signal.aborted) return
      setLoading(false)
      const stillFocused = document.activeElement === inputRef.current
      setSuggestions(results)
      setIsOpen(stillFocused && results.length > 0)
      setHighlighted(-1)
    }, DEBOUNCE_MS)
  }

  function select(labelText: string) {
    onChange(labelText, true)
    setSuggestions([])
    setIsOpen(false)
    setHighlighted(-1)
  }

  function clear() {
    onChange("", false)
    setSuggestions([])
    setIsOpen(false)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault()
      select(suggestions[highlighted].label)
    } else if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  const listId = `${id}-list`
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-1 flex-col gap-1">
      <motion.div
        key={error ? "err" : "ok"}
        animate={error && !reduced ? shake : { x: 0 }}
        className={`float-field relative rounded-xl border bg-surface transition-[border-color,box-shadow] duration-150 focus-within:shadow-[0_0_0_4px_var(--accent-soft)] ${
          error ? "border-danger focus-within:border-danger" : geocoded ? "border-success/60 focus-within:border-accent" : "border-line hover:border-line-strong focus-within:border-accent"
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={!!error}
          aria-describedby={describedBy}
          autoComplete="off"
          placeholder=" "
          value={value}
          onChange={(e) => {
            onChange(e.target.value, false)
            fetchSuggestions(e.target.value)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          onBlur={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
            abortRef.current?.abort()
            setLoading(false)
          }}
          className="peer w-full rounded-xl bg-transparent px-3.5 pt-5 pb-1.5 pr-16 text-[15px] text-ink outline-none placeholder:text-transparent"
        />
        <label htmlFor={id} className="pointer-events-none absolute top-1/2 left-3.5 origin-left -translate-y-1/2 text-sm text-ink-2 transition-[transform,color] duration-150">
          {label}
        </label>
        <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
          {loading && <span aria-hidden="true" className="mr-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />}
          {geocoded && !error && !loading && (
            <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mr-1 text-success" title="Address verified" aria-label="Address verified" role="img">
              <Check size={15} strokeWidth={2.5} />
            </motion.span>
          )}
          {value && (
            <button type="button" onClick={clear} aria-label={`Clear ${label}`} className="focus-ring rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
              <X size={14} strokeWidth={2.25} />
            </button>
          )}
        </span>
      </motion.div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="px-1 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="px-1 text-[13px] text-ink-3">
          {hint}
        </p>
      ) : null}
      <AnimatePresence>
        {isOpen && suggestions.length > 0 && (
          <motion.ul
            id={listId}
            role="listbox"
            aria-label={`${label} suggestions`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={quick}
            className="absolute top-full left-0 z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-3)]"
          >
            {suggestions.map((s, i) => (
              <li
                key={`${s.label}-${i}`}
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(s.label)
                }}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-sm transition-colors ${i === highlighted ? "bg-accent-soft text-ink" : "text-ink-2"}`}
              >
                <MapPin size={14} strokeWidth={2.25} className={`mt-0.5 shrink-0 ${i === highlighted ? "text-accent-600 dark:text-accent" : "text-ink-3"}`} aria-hidden="true" />
                <span className="leading-snug">{s.label}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
