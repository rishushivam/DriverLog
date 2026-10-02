import { useCallback, useEffect, useState } from "react"

export type Theme = "light" | "dark"
const STORAGE_KEY = "eld-theme"

function readInitial(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "light" || saved === "dark") return saved
  } catch {
    /* private mode */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/** Class-based theme on <html>, persisted per browser. index.html applies
 * the same rule before first paint so there is no flash. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readInitial)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), [])
  return [theme, toggle]
}
