import { useEffect, useState } from "react"

/** Tracks which of `ids` is the section nearest the top of the viewport
 * (below the sticky chrome), for the section tabs' active state. */
export function useScrollSpy(ids: string[], offsetPx = 120): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)
  useEffect(() => {
    if (ids.length === 0) return
    let raf = 0
    const update = () => {
      raf = 0
      let current: string | null = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        if (el.getBoundingClientRect().top - offsetPx <= 0) current = id
      }
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2
      if (atBottom) current = ids[ids.length - 1]
      setActive(current)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ids, offsetPx])
  return active
}
