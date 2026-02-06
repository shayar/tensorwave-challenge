import Link from "next/link";
import { TICKERS } from "@/lib/tickers";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Stocks</h1>
        <p className="mt-2 text-sm text-gray-600">
          Select a ticker to view company details and daily price history.
        </p>
      </header>

      <section
        aria-label="Stock tickers"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {TICKERS.map((t) => (
          <Link
            key={t.symbol}
            href={`/stock/${encodeURIComponent(t.symbol)}`}
            className="group rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/20"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-medium">{t.symbol}</div>
                <div className="text-sm text-gray-600">{t.name}</div>
              </div>

              <span className="text-sm text-gray-500 transition group-hover:translate-x-0.5">
                →
              </span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
