export default function ProductLoading() {
  return (
    <div className="container animate-pulse py-8" role="status" aria-label="Loading product">
      <div className="h-3 w-48 rounded bg-ink/10" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <div className="aspect-[4/5] rounded-sm bg-ink/10" />
        <div className="space-y-6 py-2">
          <div className="h-3 w-40 rounded bg-ink/10" />
          <div className="h-12 w-4/5 rounded bg-ink/10" />
          <div className="h-8 w-1/3 rounded bg-ink/10" />
          <div className="space-y-2"><div className="h-3 w-full rounded bg-ink/10" /><div className="h-3 w-5/6 rounded bg-ink/10" /></div>
          <div className="h-12 w-full rounded bg-ink/10" />
        </div>
      </div>
    </div>
  )
}
