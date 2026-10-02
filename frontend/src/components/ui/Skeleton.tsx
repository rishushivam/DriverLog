export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />
}

/** Placeholder for the whole results pane while the backend plans. */
export function ResultsSkeleton({ slow = false }: { slow?: boolean }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label="Planning trip">
      <div className="card flex flex-wrap gap-7 p-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-5">
        <Skeleton className="col-span-12 h-[340px] rounded-2xl xl:col-span-8 xl:h-[560px]" />
        <div className="card col-span-12 space-y-3 p-5 xl:col-span-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-[260px] w-full rounded-2xl" />
      <p className="text-center text-[13px] text-ink-3">{slow ? "Still working — the free-tier server may be waking up (this can take up to a minute)." : "Planning your trip…"}</p>
    </div>
  )
}
