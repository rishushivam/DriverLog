import { useCallback, useEffect } from "react"
import { useLocalStorage } from "./useLocalStorage"

/** Desktop sidebar collapsed state, persisted, with the "[" shortcut. */
export function useSidebar() {
  const [collapsed, setCollapsed] = useLocalStorage<boolean>("eld-sidebar-collapsed", false)
  const toggle = useCallback(() => setCollapsed((c) => !c), [setCollapsed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle])

  return { collapsed, setCollapsed, toggle }
}
