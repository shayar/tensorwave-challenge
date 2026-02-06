import Link from "next/link";
import StockLogo from "@/components/StockLogo";
import { getStock } from "@/lib/stocks";
import StockDetailsClient from "./StockDetailsClient";

type Props = {
  params: Promise<{ symbol: string }>;
};

export default async function StockDetailsPage({ params }: Props) {
  const { symbol } = await params;
  const normalizedSymbol = decodeURIComponent(symbol).toUpperCase();

  const meta = getStock(normalizedSymbol);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {meta ? <StockLogo name={meta.name} domain={meta.domain} size={52} /> : null}

          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {normalizedSymbol}
              {meta?.name ? (
                <span className="ml-3 text-base font-medium text-gray-600">
                  {meta.name}
                </span>
              ) : null}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Company overview and daily price history (from Alpha Vantage).
            </p>
          </div>
        </div>

        <Link
          href="/"
          className="rounded-xl border bg-white px-4 py-2 text-sm shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/20"
        >
          ← Back
        </Link>
      </header>

      <StockDetailsClient symbol={symbol} />
    </main>
  );
}
