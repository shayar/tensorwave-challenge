import Link from "next/link";
import StockLogo from "@/components/StockLogo";
import { STOCKS } from "@/lib/stocks";

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
        {STOCKS.map((s) => (
          <Link
            key={s.symbol}
            href={`/stock/${encodeURIComponent(s.symbol)}`}
            prefetch={false}
            className="group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/20"
          >
            <div className="flex items-center gap-4">
              <StockLogo name={s.name} domain={s.domain} size={44} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg font-semibold tracking-tight">
                    {s.symbol}
                  </div>
                  <span className="text-sm text-gray-500 transition group-hover:translate-x-0.5">
                    →
                  </span>
                </div>
                <div className="mt-1 truncate text-sm text-gray-600">
                  {s.name}
                </div>
                <div className="mt-3 inline-flex items-center rounded-full border bg-gray-50 px-2 py-1 text-xs text-gray-600">
                  View details
                </div>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
