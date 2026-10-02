import { AnimatePresence, motion } from "framer-motion"
import { ChevronUp, X } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { EASE_OUT } from "../ui/motion"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** One-line summary shown on the collapsed bar. */
  summary: ReactNode
  children: ReactNode
}

/** Mobile form container: a collapsed bar pinned to the bottom edge that
 * expands into a sheet. Drag down or tap the handle to dismiss. */
export function BottomSheet({ open, onOpenChange, summary, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false)
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, onOpenChange])

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            aria-label="Close trip form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          />
        )}
      </AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal={open}
        aria-label="Trip details"
        drag={open ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 600) onOpenChange(false)
        }}
        animate={{ y: open ? 0 : "calc(100% - 64px)" }}
        transition={{ duration: 0.36, ease: EASE_OUT }}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.35)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          className="focus-ring flex h-16 w-full shrink-0 items-center justify-between gap-3 px-5 text-left"
        >
          <span className="min-w-0">
            <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-10 rounded-full bg-line-strong" />
            <span className="block truncate text-sm font-medium text-ink">{summary}</span>
          </span>
          {open ? <X size={18} className="shrink-0 text-ink-3" /> : <ChevronUp size={18} className="shrink-0 text-ink-3" />}
        </button>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </motion.div>
    </>
  )
}
