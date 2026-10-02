import { motion } from "framer-motion"
import { RefreshCw, TriangleAlert } from "lucide-react"
import type { ApiError } from "../../api/types"
import { Button } from "../ui/Button"
import { rise } from "../ui/motion"

const TITLES: Record<ApiError["kind"], string> = {
  validation: "Check the highlighted fields",
  unprocessable: "Unable to plan this route",
  server: "Something went wrong on our end",
  network: "Couldn't reach the server",
}

export function ErrorBanner({ error, onEdit, onRetry }: { error: ApiError; onEdit: () => void; onRetry?: () => void }) {
  if (error.kind === "validation") return null
  const retryable = error.kind === "network" || error.kind === "server"
  return (
    <motion.div role="alert" variants={rise} initial="hidden" animate="show" className="flex flex-wrap items-start gap-3 rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3">
      <TriangleAlert size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-danger-ink">{TITLES[error.kind]}</p>
        <p className="mt-0.5 text-sm text-danger-ink/90">{error.message}</p>
      </div>
      <div className="flex gap-2">
        {retryable && onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry} leading={<RefreshCw size={13} aria-hidden="true" />}>
            Retry
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit trip
        </Button>
      </div>
    </motion.div>
  )
}
