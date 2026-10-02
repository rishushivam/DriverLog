import { motion } from "framer-motion"
import { TriangleAlert } from "lucide-react"
import type { ApiError } from "../../api/types"
import { rise } from "../ui/motion"

const TITLES: Record<ApiError["kind"], string> = {
  validation: "Check the highlighted fields",
  unprocessable: "Unable to plan this route",
  server: "Something went wrong on our end",
  network: "Couldn't reach the server",
}

export function ErrorBanner({ error, onEdit }: { error: ApiError; onEdit: () => void }) {
  if (error.kind === "validation") return null
  return (
    <motion.div
      role="alert"
      variants={rise}
      initial="hidden"
      animate="show"
      className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/40"
    >
      <TriangleAlert size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-900 dark:text-red-200">{TITLES[error.kind]}</p>
        <p className="mt-0.5 text-sm text-red-700 dark:text-red-300">{error.message}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="focus-ring shrink-0 rounded-lg border border-red-300 bg-surface px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
      >
        Edit trip
      </button>
    </motion.div>
  )
}
