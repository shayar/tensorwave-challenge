import Link from "next/link";
import StockDetailsClient from "./StockDetailsClient";
import StockLogo from "@/components/StockLogo";
import { STOCKS } from "@/lib/stocks";

type Props = {
  params: Promise<{ symbol: string }>;
};

export default async function StockDetailsPage({ params }: Props) {
  const { symbol } = await params;
  const normalizedSymbol = decodeURIComponent(symbol).toUpperCase();
  const stock = STOCKS.find((s) => s.symbol === normalizedSymbol);

  return (
    <main className="relative mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <StockLogo symbol={normalizedSymbol} size={52} />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {normalizedSymbol}
              {stock?.name ? (
                <span className="ml-3 text-base font-medium text-gray-600">
                  {stock.name}
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
          className="rounded-xl border bg-white px-4 py-2 text-sm shadow-sm transition
                     hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/20"
        >
          ← Back
        </Link>
      </header>

      <StockDetailsClient symbol={symbol} />
    </main>
  );
}
