export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />
}

/** Placeholder for the whole results pane while the backend plans. */
export function ResultsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Planning trip">
      <div className="flex flex-wrap gap-6 rounded-2xl border border-line bg-surface p-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[320px] w-full rounded-2xl" />
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[260px] w-full rounded-2xl" />
      <span className="sr-only">Planning your trip…</span>
    </div>
  )
}
