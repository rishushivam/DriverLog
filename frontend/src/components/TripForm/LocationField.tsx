import { useEffect, useRef, useState } from "react"
import { MapPin } from "lucide-react"
import { suggestLocations } from "../../api/geocode"
import type { LocationSuggestion } from "../../api/types"

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3

/** Live-typing suggestions via the backend's ORS autocomplete proxy (see
 * trips/views.py::geocode_suggest) — debounced and abortable so a fast
 * typist doesn't queue up a pile of stale requests. Selecting a suggestion
 * fills the field with ORS's own formatted label, which the backend can
 * then geocode with high confidence on submit. */
export function LocationField({ label, value, onChange, error }: Props) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const suppressNextFetch = useRef(false)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  function fetchSuggestions(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      const results = await suggestLocations(query, controller.signal)
      if (controller.signal.aborted) return
      // The user may have already clicked or tabbed away by the time this
      // resolves — a stale response landing after focus has moved on must
      // not reopen a dropdown nobody's looking at.
      const stillFocused = document.activeElement === inputRef.current
      setSuggestions(results)
      setIsOpen(stillFocused && results.length > 0)
      setHighlightedIndex(-1)
    }, DEBOUNCE_MS)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    onChange(next)
    if (suppressNextFetch.current) {
      suppressNextFetch.current = false
      return
    }
    fetchSuggestions(next)
  }

  function selectSuggestion(suggestionLabel: string) {
    suppressNextFetch.current = true
    onChange(suggestionLabel)
    setSuggestions([])
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[highlightedIndex].label)
    } else if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <input
        ref={inputRef}
        type="text"
        required
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        onBlur={() => {
          if (debounceRef.current) clearTimeout(debounceRef.current)
          abortRef.current?.abort()
        }}
        placeholder="Street, City, State"
        className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-150 focus:border-navy-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      {isOpen && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded-sm border border-slate-300 bg-white shadow-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.label}-${i}`}
              role="option"
              aria-selected={i === highlightedIndex}
              onMouseDown={(e) => {
                e.preventDefault()
                selectSuggestion(s.label)
              }}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm transition-colors ${
                i === highlightedIndex ? "bg-navy-50 text-navy-700" : "text-slate-700"
              }`}
            >
              <MapPin
                size={13}
                strokeWidth={2.25}
                className={`mt-0.5 shrink-0 ${i === highlightedIndex ? "text-navy-600" : "text-slate-500"}`}
              />
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
