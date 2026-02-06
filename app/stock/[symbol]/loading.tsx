export default function LoadingStock() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-80 animate-pulse rounded bg-gray-200" />
        </div>

        <div className="rounded-xl border bg-white px-4 py-2 text-sm shadow-sm">
          ← Back
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            <div className="text-sm font-medium text-gray-700">Loading overview…</div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
            <div className="h-24 w-full animate-pulse rounded bg-gray-200" />
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            <div className="text-sm font-medium text-gray-700">Loading prices…</div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
            <div className="h-28 w-full animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      </section>
    </main>
  );
}
