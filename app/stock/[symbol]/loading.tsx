export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="h-8 w-40 rounded skeleton-shimmer" />
      <div className="mt-3 h-4 w-96 rounded skeleton-shimmer" />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="h-5 w-44 rounded skeleton-shimmer" />
          <div className="mt-4 space-y-3">
            <div className="h-4 w-2/3 rounded skeleton-shimmer" />
            <div className="h-4 w-1/2 rounded skeleton-shimmer" />
            <div className="h-64 w-full rounded skeleton-shimmer" />
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="h-5 w-52 rounded skeleton-shimmer" />
          <div className="mt-4 h-56 w-full rounded skeleton-shimmer" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="h-24 rounded skeleton-shimmer" />
            <div className="h-24 rounded skeleton-shimmer" />
            <div className="h-24 rounded skeleton-shimmer" />
            <div className="h-24 rounded skeleton-shimmer" />
          </div>
          <div className="mt-4 h-48 w-full rounded skeleton-shimmer" />
        </div>
      </div>
    </main>
  );
}
