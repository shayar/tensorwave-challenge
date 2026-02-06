"use client";

export default function StockDetailsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-gray-600">
        {error?.message || "Failed to load this stock page."}
      </p>
      <button
        className="mt-4 rounded-xl border bg-white px-4 py-2 text-sm shadow-sm"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
