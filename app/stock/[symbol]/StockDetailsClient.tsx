'use client';

import { useEffect, useMemo, useState } from "react";

type Overview = {
  Symbol?: string;
  AssetType?: string;
  Name?: string;
  Description?: string;
  Exchange?: string;
  Sector?: string;
  Industry?: string;
  MarketCapitalization?: string;
};

type DailySeries = Record<
  string,
  {
    "4. close"?: string;
    "5. volume"?: string;
  }
>;

type PriceRow = {
  date: string;
  close: number;
  volume: number;
  pctChange: number | null; // null when we can't compute it (e.g., oldest row)
};

function valueOrNA(v: unknown): string {
  if (v === null || v === undefined) return "N/A";
  const s = String(v).trim();
  return s.length ? s : "N/A";
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPct(pct: number | null) {
  if (pct === null) return "N/A";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

// Retry-After can be either delay-seconds or an HTTP date
function parseRetryAfterSeconds(v: string | null): number | null {
  if (!v) return null;

  const asSeconds = Number(v);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return Math.ceil(asSeconds);

  const asDateMs = Date.parse(v);
  if (!Number.isNaN(asDateMs)) {
    const diffMs = asDateMs - Date.now();
    return diffMs > 0 ? Math.ceil(diffMs / 1000) : 0;
  }

  return null;
}

function RateLimitBanner({
  message,
  retryIn,
  onRetry,
}: {
  message: string;
  retryIn: number;
  onRetry: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">Temporarily rate limited</div>
          <div className="mt-1 text-amber-800">{message}</div>
          <div className="mt-1 text-amber-800">
            {retryIn > 0 ? `Retry available in ${retryIn}s.` : `You can retry now.`}
          </div>
        </div>

        <button
          type="button"
          disabled={retryIn > 0}
          onClick={onRetry}
          className="shrink-0 rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {retryIn > 0 ? `Retry (${retryIn}s)` : "Retry"}
        </button>
      </div>
    </div>
  );
}

function SkeletonLine({ className }: { className: string }) {
  return <div className={`rounded skeleton-shimmer ${className}`} />;
}

function FancyLoading({ label }: { label: string }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        <div className="text-sm font-medium text-gray-700">{label}</div>
      </div>

      <div className="space-y-3">
        <SkeletonLine className="h-4 w-2/3" />
        <SkeletonLine className="h-4 w-1/2" />
        <SkeletonLine className="h-24 w-full" />
      </div>
    </div>
  );
}

function PriceHistoryChart({ rows }: { rows: PriceRow[] }) {
  if (!rows || rows.length < 2) return null;

  const closes = rows.map((r) => r.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const W = 600;
  const H = 180;
  const pad = 10;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;

  const points = rows
    .map((r, i) => {
      const x = pad + (i / (rows.length - 1)) * innerW;
      const y = pad + (1 - (r.close - min) / range) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full text-gray-900"
        role="img"
        aria-label="Price history line chart"
      >
        {/* subtle baseline */}
        <line
          x1={pad}
          y1={H - pad}
          x2={W - pad}
          y2={H - pad}
          stroke="currentColor"
          strokeOpacity="0.15"
        />

        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <span>{rows[0].date}</span>
        <span>{rows[rows.length - 1].date}</span>
      </div>
    </div>
  );
}


export default function StockDetailsClient({ symbol }: { symbol: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  const [prices, setPrices] = useState<PriceRow[] | null>(null);
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(true);

  // Countdown clock
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Cooldowns for 429
  const [overviewCooldownUntil, setOverviewCooldownUntil] = useState<number>(0);
  const [pricesCooldownUntil, setPricesCooldownUntil] = useState<number>(0);

  // Retry triggers
  const [overviewReloadToken, setOverviewReloadToken] = useState(0);
  const [pricesReloadToken, setPricesReloadToken] = useState(0);

  const normalizedSymbol = useMemo(
    () => decodeURIComponent(symbol).toUpperCase(),
    [symbol]
  );

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const overviewRetryIn = Math.max(
    0,
    Math.ceil((overviewCooldownUntil - nowMs) / 1000)
  );
  const pricesRetryIn = Math.max(
    0,
    Math.ceil((pricesCooldownUntil - nowMs) / 1000)
  );

  // ----- OVERVIEW -----
  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setLoadingOverview(true);
      setOverviewError(null);

      try {
        const res = await fetch(
          `/api/av?function=OVERVIEW&symbol=${encodeURIComponent(normalizedSymbol)}`
        );

        let json: any = null;
        try {
          json = await res.json();
        } catch {
          // If proxy ever returns non-JSON, handle cleanly
          json = null;
        }

        const retryAfter =
          parseRetryAfterSeconds(res.headers.get("retry-after")) ?? 1;

        if (res.status === 429) {
          if (!cancelled) {
            setOverviewCooldownUntil(Date.now() + retryAfter * 1000);
          }
          const msg =
            json?.error ??
            "Rate limited by upstream API. Please wait and retry.";
          throw new Error(`${msg}`);
        }

        if (!res.ok || !json?.ok) {
          throw new Error(
            json?.error ?? `Failed to load overview (HTTP ${res.status})`
          );
        }

        const data = json.data as Overview;

        if (!cancelled) setOverview(data);
      } catch (e: any) {
        if (!cancelled) setOverviewError(e?.message ?? "Failed to load overview.");
      } finally {
        if (!cancelled) setLoadingOverview(false);
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, [normalizedSymbol, overviewReloadToken]);

  // ----- PRICES -----
  useEffect(() => {
    let cancelled = false;

    async function loadPrices() {
      setLoadingPrices(true);
      setPricesError(null);

      try {
        const res = await fetch(
          `/api/av?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(normalizedSymbol)}`
        );

        let json: any = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }

        const retryAfter =
          parseRetryAfterSeconds(res.headers.get("retry-after")) ?? 1;

        if (res.status === 429) {
          if (!cancelled) {
            setPricesCooldownUntil(Date.now() + retryAfter * 1000);
          }
          const msg =
            json?.error ??
            "Rate limited by upstream API. Please wait and retry.";
          throw new Error(`${msg}`);
        }

        if (!res.ok || !json?.ok) {
          throw new Error(
            json?.error ?? `Failed to load prices (HTTP ${res.status})`
          );
        }

        const series: DailySeries | undefined = json?.data?.["Time Series (Daily)"];
        if (!series || typeof series !== "object") {
          throw new Error("Price series missing in response.");
        }

        const baseRows = Object.entries(series)
          .map(([date, d]) => {
            const close = Number(d?.["4. close"]);
            const volume = Number(d?.["5. volume"]);
            return { date, close, volume };
          })
          .filter((r) => Number.isFinite(r.close) && Number.isFinite(r.volume))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 31); // +1 row for % change math

        const rows: PriceRow[] = baseRows.slice(0, 30).map((r, i) => {
          const prev = baseRows[i + 1];
          const pctChange =
            prev && prev.close !== 0 ? ((r.close - prev.close) / prev.close) * 100 : null;
          return { ...r, pctChange };
        });

        if (!cancelled) setPrices(rows);
      } catch (e: any) {
        if (!cancelled) setPricesError(e?.message ?? "Failed to load prices.");
      } finally {
        if (!cancelled) setLoadingPrices(false);
      }
    }

    loadPrices();
    return () => {
      cancelled = true;
    };
  }, [normalizedSymbol, pricesReloadToken]);

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      {/* Company Overview */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium">Company Overview</h2>

        {loadingOverview ? (
           <FancyLoading label="Loading company overview…" />
        ) : overviewError ? (
          <RateLimitBanner
            message={overviewError}
            retryIn={overviewRetryIn}
            onRetry={() => setOverviewReloadToken((x) => x + 1)}
          />
        ) : (
          <div className="mt-4 space-y-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-gray-500">Symbol</dt>
                <dd className="text-sm">{valueOrNA(overview?.Symbol ?? normalizedSymbol)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Asset Type</dt>
                <dd className="text-sm">{valueOrNA(overview?.AssetType)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Name</dt>
                <dd className="text-sm">{valueOrNA(overview?.Name)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Exchange</dt>
                <dd className="text-sm">{valueOrNA(overview?.Exchange)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Sector</dt>
                <dd className="text-sm">{valueOrNA(overview?.Sector)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Industry</dt>
                <dd className="text-sm">{valueOrNA(overview?.Industry)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-gray-500">Market Cap</dt>
                <dd className="text-sm">{valueOrNA(overview?.MarketCapitalization)}</dd>
              </div>
            </dl>

            <div>
              <h3 className="text-xs font-medium text-gray-500">Description</h3>
              <p className="mt-2 text-sm text-gray-700">
                {valueOrNA(overview?.Description)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Daily Price History */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium">Daily Price History</h2>
        <p className="mt-2 text-sm text-gray-600">
          Latest daily closes & volume, plus % change vs previous trading day.
        </p>

        {loadingPrices ? (
          <div className="mt-4 space-y-4">
    <div className="flex items-center gap-3">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      <div className="text-sm font-medium text-gray-700">Loading prices…</div>
    </div>

    <div className="space-y-3">
      <SkeletonLine className="h-4 w-2/3" />
      <SkeletonLine className="h-28 w-full" />
    </div>
  </div>
        ) : pricesError ? (
          <RateLimitBanner
            message={pricesError}
            retryIn={pricesRetryIn}
            onRetry={() => setPricesReloadToken((x) => x + 1)}
          />
        ) : !prices || prices.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No price data available.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <PriceHistoryChart rows={[...prices].reverse()} />
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs text-gray-500">
                <tr>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Close</th>
                  <th className="py-2 pr-3">Volume</th>
                  <th className="py-2 pr-3">% Change</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((row) => (
                  <tr key={row.date} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">{row.date}</td>
                    <td className="py-2 pr-3">{formatMoney(row.close)}</td>
                    <td className="py-2 pr-3">{formatNumber(row.volume)}</td>
                    <td className="py-2 pr-3">{formatPct(row.pctChange)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
