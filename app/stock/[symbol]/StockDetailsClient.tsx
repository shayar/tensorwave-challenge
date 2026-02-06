"use client";

import React, { useEffect, useMemo, useState } from "react";

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
  pctChange: number | null;
};

type ApiOk<T> = {
  ok: true;
  data: T;
  cached?: boolean;
  stale?: boolean;
  source?: string; // "upstream" | "memory" | "disk" | "fixture" | "disk-stale"
  warning?: string;
};

type ApiErr = { ok: false; error: string };

type DataMeta = {
  source: string; // normalized label like "upstream" / "disk-stale" etc.
  cached: boolean;
  stale: boolean;
  warning?: string;
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** ---------------------- Data Source Badge ---------------------- **/

function sourcePresentation(meta: DataMeta) {
  const source = (meta.source ?? "").toLowerCase();

  if (meta.stale || source.includes("stale")) {
    return {
      label: "Stale (cache fallback)",
      className:
        "border-amber-200 bg-amber-50 text-amber-800",
      dot: "bg-amber-500",
    };
  }

  if (source === "upstream") {
    return {
      label: "Live (Alpha Vantage)",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-800",
      dot: "bg-emerald-500",
    };
  }

  if (source === "fixture") {
    return {
      label: "Fixture",
      className:
        "border-purple-200 bg-purple-50 text-purple-800",
      dot: "bg-purple-500",
    };
  }

  if (source === "memory" || source === "disk") {
    return {
      label: "Cached",
      className:
        "border-slate-200 bg-slate-50 text-slate-700",
      dot: "bg-slate-500",
    };
  }

  // default
  return {
    label: meta.cached ? "Cached" : "Live",
    className:
      "border-slate-200 bg-slate-50 text-slate-700",
    dot: "bg-slate-500",
  };
}

function DataSourceBadge({
  meta,
  titlePrefix,
}: {
  meta: DataMeta | null;
  titlePrefix?: string;
}) {
  if (!meta) return null;

  const p = sourcePresentation(meta);
  const title = [
    titlePrefix ? `${titlePrefix}:` : "",
    `source=${meta.source}`,
    `cached=${String(meta.cached)}`,
    `stale=${String(meta.stale)}`,
    meta.warning ? `warning=${meta.warning}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${p.className}`}
        title={title}
      >
        <span className={`h-2 w-2 rounded-full ${p.dot}`} />
        {p.label}
      </span>

      {meta.warning ? (
        <span
          className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800"
          title={meta.warning}
        >
          Warning
        </span>
      ) : null}
    </div>
  );
}

/** ---------------------- Chart ---------------------- **/

function PriceHistoryChart({
  rows,
  formatMoney,
}: {
  rows: PriceRow[];
  formatMoney: (n: number) => string;
}) {
  if (!rows || rows.length < 2) return null;

  const closes = rows.map((r) => r.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const W = 760;
  const H = 240;
  const padX = 18;
  const padY = 16;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const pointAt = (i: number) => {
    const r = rows[i];
    const x = padX + (i / (rows.length - 1)) * innerW;
    const y = padY + (1 - (r.close - min) / range) * innerH;
    return { x, y, r };
  };

  const points = rows
    .map((_, i) => {
      const { x, y } = pointAt(i);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPath =
    `M ${padX},${H - padY} ` +
    rows
      .map((_, i) => {
        const { x, y } = pointAt(i);
        return `L ${x},${y}`;
      })
      .join(" ") +
    ` L ${W - padX},${H - padY} Z`;

  const [hover, setHover] = useState<{
    i: number;
    x: number;
    y: number;
    tipLeftPx: number;
    tipTopPx: number;
  } | null>(null);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const xNorm = clamp(xPx / rect.width, 0, 1);

    const i = Math.round(xNorm * (rows.length - 1));
    const { x, y } = pointAt(i);

    const tipLeftPx = (x / W) * rect.width;
    const tipTopPx = (y / H) * rect.height;

    setHover({ i, x, y, tipLeftPx, tipTopPx });
  }

  function onLeave() {
    setHover(null);
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  const safeLeft = hover ? clamp(hover.tipLeftPx, 70, 690) : 0;

  return (
    <div className="mt-4">
      <div className="relative overflow-hidden rounded-2xl border bg-white">
        <div className="flex items-center justify-between px-4 py-3 text-sm text-gray-600">
          <span className="font-medium">30D trend</span>
          <span>
            Min {min.toFixed(2)} · Max {max.toFixed(2)}
          </span>
        </div>

        <div className="relative px-4 pb-4">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-56 w-full select-none"
            role="img"
            aria-label="Price history chart"
            onMouseMove={onMove}
            onMouseLeave={onLeave}
          >
            <defs>
              <linearGradient id="tw_area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {Array.from({ length: 4 }).map((_, idx) => {
              const y = padY + (idx / 3) * innerH;
              return (
                <line
                  key={idx}
                  x1={padX}
                  y1={y}
                  x2={W - padX}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.06"
                />
              );
            })}

            <path d={areaPath} fill="url(#tw_area)" />
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.95"
            />

            {(() => {
              const lastIdx = rows.length - 1;
              const { x, y } = pointAt(lastIdx);
              return <circle cx={x} cy={y} r="5" fill="currentColor" opacity="0.85" />;
            })()}

            {hover && (
              <>
                <line
                  x1={hover.x}
                  y1={padY}
                  x2={hover.x}
                  y2={H - padY}
                  stroke="currentColor"
                  strokeOpacity="0.15"
                />
                <circle
                  cx={hover.x}
                  cy={hover.y}
                  r="6"
                  fill="white"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
              </>
            )}
          </svg>

          {hover && (
            <div
              className="pointer-events-none absolute top-0"
              style={{
                left: safeLeft,
                transform: `translate(-50%, ${hover.tipTopPx - 10}px)`,
              }}
            >
              <div className="rounded-xl border bg-white px-3 py-2 text-xs shadow-md">
                <div className="font-medium text-gray-900">{rows[hover.i].date}</div>
                <div className="text-gray-600">Close: {formatMoney(rows[hover.i].close)}</div>
              </div>
            </div>
          )}

          <div className="mt-2 flex justify-between px-1 text-xs text-gray-500">
            <span>{first.date}</span>
            <span>{last.date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  span2,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "pos" | "neg";
  span2?: boolean;
}) {
  const toneClass =
    tone === "pos" ? "text-emerald-700" : tone === "neg" ? "text-red-700" : "text-gray-900";

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${span2 ? "sm:col-span-2" : ""}`}>
      <div className="text-sm text-gray-600">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-1 text-sm text-gray-500">{sub}</div> : null}
    </div>
  );
}

export default function StockDetailsClient({ symbol }: { symbol: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewMeta, setOverviewMeta] = useState<DataMeta | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  const [prices, setPrices] = useState<PriceRow[] | null>(null);
  const [pricesMeta, setPricesMeta] = useState<DataMeta | null>(null);
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(true);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [overviewCooldownUntil, setOverviewCooldownUntil] = useState<number>(0);
  const [pricesCooldownUntil, setPricesCooldownUntil] = useState<number>(0);

  const [overviewReloadToken, setOverviewReloadToken] = useState(0);
  const [pricesReloadToken, setPricesReloadToken] = useState(0);

  const normalizedSymbol = useMemo(() => decodeURIComponent(symbol).toUpperCase(), [symbol]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const overviewRetryIn = Math.max(0, Math.ceil((overviewCooldownUntil - nowMs) / 1000));
  const pricesRetryIn = Math.max(0, Math.ceil((pricesCooldownUntil - nowMs) / 1000));

  function extractMeta(json: any): DataMeta {
    return {
      source: String(json?.source ?? "unknown"),
      cached: Boolean(json?.cached),
      stale: Boolean(json?.stale),
      warning: json?.warning ? String(json.warning) : undefined,
    };
  }

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

        let json: ApiOk<Overview> | ApiErr | null = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }

        const retryAfter = parseRetryAfterSeconds(res.headers.get("retry-after")) ?? 1;

        if (res.status === 429) {
          if (!cancelled) setOverviewCooldownUntil(Date.now() + retryAfter * 1000);
          const msg = (json as any)?.error ?? "Rate limited by upstream API. Please wait and retry.";
          throw new Error(msg);
        }

        if (!res.ok || !(json as any)?.ok) {
          throw new Error((json as any)?.error ?? `Failed to load overview (HTTP ${res.status})`);
        }

        const okJson = json as ApiOk<Overview>;
        if (!cancelled) {
          setOverview(okJson.data);
          setOverviewMeta(extractMeta(okJson));
        }
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

        let json: ApiOk<any> | ApiErr | null = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }

        const retryAfter = parseRetryAfterSeconds(res.headers.get("retry-after")) ?? 1;

        if (res.status === 429) {
          if (!cancelled) setPricesCooldownUntil(Date.now() + retryAfter * 1000);
          const msg = (json as any)?.error ?? "Rate limited by upstream API. Please wait and retry.";
          throw new Error(msg);
        }

        if (!res.ok || !(json as any)?.ok) {
          throw new Error((json as any)?.error ?? `Failed to load prices (HTTP ${res.status})`);
        }

        const okJson = json as ApiOk<any>;
        const series: DailySeries | undefined = okJson?.data?.["Time Series (Daily)"];
        if (!series || typeof series !== "object") throw new Error("Price series missing.");

        const baseRows = Object.entries(series)
          .map(([date, d]) => {
            const close = Number(d?.["4. close"]);
            const volume = Number(d?.["5. volume"]);
            return { date, close, volume };
          })
          .filter((r) => Number.isFinite(r.close) && Number.isFinite(r.volume))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 31);

        const rows: PriceRow[] = baseRows.slice(0, 30).map((r, i) => {
          const prev = baseRows[i + 1];
          const pctChange = prev && prev.close !== 0 ? ((r.close - prev.close) / prev.close) * 100 : null;
          return { ...r, pctChange };
        });

        if (!cancelled) {
          setPrices(rows);
          setPricesMeta(extractMeta(okJson));
        }
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

  // Derived stats
  const stats = useMemo(() => {
    if (!prices || prices.length === 0) return null;

    const latest = prices[0];
    const latestClose = latest.close;
    const latestDate = latest.date;
    const latestPct = latest.pctChange;

    const closes = prices.map((p) => p.close);
    const hi = Math.max(...closes);
    const lo = Math.min(...closes);

    const avgVol = prices.reduce((acc, p) => acc + p.volume, 0) / Math.max(1, prices.length);

    return { latestClose, latestDate, latestPct, hi, lo, avgVol };
  }, [prices]);

  return (
    <section className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
      {/* Company Overview */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm lg:h-[78vh] flex flex-col min-h-0">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-medium">Company Overview</h2>
          <DataSourceBadge meta={overviewMeta} titlePrefix="Overview" />
        </div>

        {loadingOverview ? (
          <FancyLoading label="Loading company overview…" />
        ) : overviewError ? (
          <RateLimitBanner
            message={overviewError}
            retryIn={overviewRetryIn}
            onRetry={() => setOverviewReloadToken((x) => x + 1)}
          />
        ) : (
          <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-3">
            <div className="space-y-4">
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
                <p className="mt-2 text-sm leading-6 text-gray-700">{valueOrNA(overview?.Description)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Daily Price History */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm lg:h-[78vh] flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Daily Price History</h2>
            <p className="mt-2 text-sm text-gray-600">
              Latest daily closes & volume, plus % change vs previous trading day.
            </p>
          </div>
          <div className="pt-0.5">
            <DataSourceBadge meta={pricesMeta} titlePrefix="Prices" />
          </div>
        </div>

        {loadingPrices ? (
          <FancyLoading label="Loading prices…" />
        ) : pricesError ? (
          <RateLimitBanner
            message={pricesError}
            retryIn={pricesRetryIn}
            onRetry={() => setPricesReloadToken((x) => x + 1)}
          />
        ) : !prices || prices.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No price data available.</p>
        ) : (
          <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-3">
            <PriceHistoryChart rows={[...prices].reverse()} formatMoney={formatMoney} />

            {stats ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <StatCard
                  label="Latest Close"
                  value={formatMoney(stats.latestClose)}
                  sub={stats.latestDate}
                />
                <StatCard
                  label="Daily Change"
                  value={formatPct(stats.latestPct)}
                  sub="vs previous day"
                  tone={
                    stats.latestPct === null ? "neutral" : stats.latestPct >= 0 ? "pos" : "neg"
                  }
                />
                <StatCard label="30D High" value={formatMoney(stats.hi)} />
                <StatCard label="30D Low" value={formatMoney(stats.lo)} />
                <StatCard
                  label="Avg Volume (30D)"
                  value={formatNumber(Math.round(stats.avgVol))}
                  span2
                />
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border bg-white shadow-sm">
              <div className="px-4 py-3 text-sm font-medium text-gray-800">Latest daily rows</div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b bg-white text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Close</th>
                      <th className="px-4 py-3">Volume</th>
                      <th className="px-4 py-3">% Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.map((row, idx) => {
                      const tone =
                        row.pctChange === null
                          ? "text-gray-700"
                          : row.pctChange >= 0
                          ? "text-emerald-700"
                          : "text-red-700";

                      return (
                        <tr
                          key={row.date}
                          className={`border-b last:border-b-0 ${
                            idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                          }`}
                        >
                          <td className="px-4 py-3 font-medium">{row.date}</td>
                          <td className="px-4 py-3">{formatMoney(row.close)}</td>
                          <td className="px-4 py-3">{formatNumber(row.volume)}</td>
                          <td className={`px-4 py-3 ${tone}`}>{formatPct(row.pctChange)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="h-3" />
          </div>
        )}
      </div>
    </section>
  );
}
