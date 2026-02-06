import Link from "next/link";
import StockDetailsClient from "./StockDetailsClient";

type Props = {
  params: Promise<{ symbol: string }>;
};

export default async function StockDetailsPage({ params }: Props) {
  const { symbol } = await params; // <-- unwrap Promise
  const normalizedSymbol = decodeURIComponent(symbol).toUpperCase();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{normalizedSymbol}</h1>
          <p className="mt-2 text-sm text-gray-600">
            Company overview and daily price history (from Alpha Vantage).
          </p>
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
