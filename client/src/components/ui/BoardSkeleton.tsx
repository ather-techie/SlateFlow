function CardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 animate-pulse">
      <div className="h-3 bg-slate-200 rounded w-3/4 mb-2" />
      <div className="h-3 bg-slate-200 rounded w-1/2 mb-3" />
      <div className="flex gap-2">
        <div className="h-4 w-6 bg-slate-200 rounded" />
        <div className="h-4 w-8 bg-slate-200 rounded" />
      </div>
    </div>
  )
}

function ColumnSkeleton() {
  return (
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center gap-2 px-3 py-2 mb-2 animate-pulse">
        <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
        <div className="h-3 w-24 bg-slate-300 rounded" />
        <div className="h-4 w-5 bg-slate-200 rounded-full ml-1" />
      </div>
      <div className="bg-slate-200/50 rounded-xl p-2 space-y-2">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  )
}

export default function BoardSkeleton() {
  return (
    <div className="flex gap-5 px-6 pt-4">
      <ColumnSkeleton />
      <ColumnSkeleton />
      <ColumnSkeleton />
    </div>
  )
}
