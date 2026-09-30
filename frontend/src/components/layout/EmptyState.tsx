export function EmptyState() {
  return (
    <div className="ruled-grid-watermark flex min-h-[220px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-white/70 p-12 text-center">
      <p className="text-sm font-medium text-slate-700">No trip planned yet</p>
      <p className="max-w-sm text-sm text-slate-500">
        Enter the driver's current location, pickup, and dropoff above to get a route with required stops and a set of
        FMCSA daily logs ready for review.
      </p>
    </div>
  )
}
