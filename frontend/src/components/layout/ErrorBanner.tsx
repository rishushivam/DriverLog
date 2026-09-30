import { TriangleAlert } from "lucide-react"
import type { ApiError } from "../../api/types"

const TITLES: Record<ApiError["kind"], string> = {
  validation: "Check the highlighted fields",
  unprocessable: "Unable to plan this route",
  server: "Something went wrong on our end",
  network: "Couldn't reach the server",
}

export function ErrorBanner({ error }: { error: ApiError }) {
  if (error.kind === "validation") return null
  return (
    <div role="alert" className="animate-reveal flex items-start gap-3 rounded-md border border-red-300 bg-red-50 px-4 py-3">
      <TriangleAlert size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-900">{TITLES[error.kind]}</p>
        <p className="mt-0.5 text-sm text-red-700">{error.message}</p>
      </div>
      <button
        type="button"
        onClick={() => document.getElementById("trip-details")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="shrink-0 rounded-sm border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors duration-150 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
      >
        Edit trip
      </button>
    </div>
  )
}
