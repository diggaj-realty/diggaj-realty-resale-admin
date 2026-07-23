export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="skeleton h-6 w-48 rounded-lg" />
          <div className="skeleton h-3.5 w-32 rounded-lg" />
        </div>
        <div className="skeleton h-9 w-28 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton mt-3 h-7 w-16 rounded-lg" />
            <div className="skeleton mt-3 h-3 w-24 rounded" />
          </div>
        ))}
      </div>

      <div className="card overflow-hidden p-6">
        <div className="skeleton h-4 w-40 rounded" />
        <div className="mt-5 flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
