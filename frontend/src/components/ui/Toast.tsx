import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react"
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"
import { quick } from "./motion"

export type ToastKind = "success" | "error" | "info"
export interface Toast {
  id: number
  kind: ToastKind
  title: string
  detail?: string
}

interface ToastApi {
  toast: (kind: ToastKind, title: string, detail?: string) => void
}

const ToastContext = createContext<ToastApi>({ toast: () => {} })
export const useToast = () => useContext(ToastContext)

const ICON = { success: CheckCircle2, error: AlertTriangle, info: Info }
const TONE = {
  success: "border-success/40 text-success-ink bg-success-soft",
  error: "border-danger/40 text-danger-ink bg-danger-soft",
  info: "border-info/40 text-info-ink bg-info-soft",
}
const ICON_TONE = { success: "text-success", error: "text-danger", info: "text-info" }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback(
    (kind: ToastKind, title: string, detail?: string) => {
      const id = ++counter.current
      setToasts((t) => [...t.slice(-3), { id, kind, title, detail }])
      setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3200)
    },
    [dismiss],
  )
  const api = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 print:hidden sm:items-end sm:px-6">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = ICON[t.kind]
            return (
              <motion.div
                key={t.id}
                role={t.kind === "error" ? "alert" : "status"}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={quick}
                className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-[var(--shadow-3)] backdrop-blur ${TONE[t.kind]}`}
              >
                <Icon size={18} className={`mt-0.5 shrink-0 ${ICON_TONE[t.kind]}`} aria-hidden="true" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{t.title}</p>
                  {t.detail && <p className="mt-0.5 text-[13px] opacity-90">{t.detail}</p>}
                </div>
                <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="focus-ring -mr-1 rounded-md p-1 opacity-70 hover:opacity-100">
                  <X size={14} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
