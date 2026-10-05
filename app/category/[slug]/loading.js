export default function CategoryLoading() {
  return (
    <div className="container animate-pulse py-8" role="status" aria-label="Loading collection">
      <div className="h-3 w-40 rounded bg-ink/10" />
      <div className="mt-8 h-10 w-56 rounded bg-ink/10" />
      <div className="mt-4 h-4 max-w-xl rounded bg-ink/10" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index}>
            <div className="aspect-[4/5] rounded-sm bg-ink/10" />
            <div className="mt-3 h-4 w-2/3 rounded bg-ink/10" />
            <div className="mt-2 h-3 w-1/3 rounded bg-ink/10" />
          </div>
        ))}
      </div>
    </div>
  )
}
