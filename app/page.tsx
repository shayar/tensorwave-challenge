import Link from "next/link";
import StockLogo from "@/components/StockLogo";
import { STOCKS } from "@/lib/stocks";

export default function Home() {
  return (
    <main className="relative mx-auto max-w-6xl px-4 py-10">
      {/* subtle “market” dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60
        [background-image:radial-gradient(rgba(0,0,0,0.08)_1px,transparent_1px)]
        [background-size:22px_22px]"
      />

      <header className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-gray-700 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Tensor Wave Stock Info Challenge
        </div>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Stocks</h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-700">
          A clean watchlist UI with a resilient Alpha Vantage proxy + cached detail pages.
          Select a ticker to view company overview and daily price history.
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
            className="group rounded-3xl border bg-white p-5 shadow-sm transition
                       hover:-translate-y-0.5 hover:shadow-md focus:outline-none
                       focus:ring-2 focus:ring-black/20"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <StockLogo symbol={s.symbol} size={46} className="shrink-0" />
                <div>
                  <div className="text-xl font-semibold tracking-tight">{s.symbol}</div>
                  <div className="mt-0.5 text-sm text-gray-600">{s.name}</div>

                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-700">
                    View details <span className="transition group-hover:translate-x-0.5">→</span>
                  </div>
                </div>
              </div>

              <span className="text-sm text-gray-400 transition group-hover:translate-x-0.5">
                →
              </span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
