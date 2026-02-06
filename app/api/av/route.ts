// app/api/av/route.ts
import { NextRequest, NextResponse } from "next/server";

type AvFunction = "OVERVIEW" | "TIME_SERIES_DAILY";

const ALLOWED_FUNCTIONS = new Set<AvFunction>(["OVERVIEW", "TIME_SERIES_DAILY"]);
// Allows common tickers like AAPL, MSFT, BRK.B, RDS-A (keep it strict to avoid abuse)
const SYMBOL_RE = /^[A-Z0-9.\-]{1,10}$/;

type CacheEntry = { expiresAt: number; payload: unknown };
const globalForCache = globalThis as unknown as { __avCache?: Map<string, CacheEntry> };
const cache = globalForCache.__avCache ?? (globalForCache.__avCache = new Map());

function ttlSeconds(fn: AvFunction) {
  // Overview changes infrequently; daily series changes ~daily.
  return fn === "OVERVIEW" ? 24 * 60 * 60 : 60 * 60;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) return jsonError("Server misconfigured: missing ALPHAVANTAGE_API_KEY", 500);

  const { searchParams } = new URL(req.url);
  const fnRaw = searchParams.get("function")?.toUpperCase();
  const symbol = searchParams.get("symbol")?.toUpperCase();

  const fn = (fnRaw ?? "") as AvFunction;

  if (!ALLOWED_FUNCTIONS.has(fn)) {
    return jsonError("Invalid 'function'. Use OVERVIEW or TIME_SERIES_DAILY.", 400);
  }
  if (!symbol || !SYMBOL_RE.test(symbol)) {
    return jsonError("Invalid 'symbol'. Example: MSFT, AAPL, BRK.B", 400);
  }

  const key = `${fn}:${symbol}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return NextResponse.json(
      { ok: true, cached: true, data: hit.payload },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } }
    );
  }

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", fn);
  url.searchParams.set("symbol", symbol);

  // Reduce payload + request cost (Alpha Vantage recommends compact for smaller responses)
  if (fn === "TIME_SERIES_DAILY") url.searchParams.set("outputsize", "compact");

  url.searchParams.set("apikey", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    const text = await res.text();

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return jsonError("Upstream returned non-JSON response.", 502);
    }

    // Alpha Vantage uses "Note" for throttling messages quite often
    if (data?.Note) {
      return NextResponse.json({ ok: false, error: data.Note }, { status: 429 });
    }
    if (data?.["Error Message"]) {
      return jsonError(`Alpha Vantage error: ${data["Error Message"]}`, 502);
    }
    if (!res.ok) {
      return jsonError(`Upstream HTTP ${res.status}`, 502);
    }

    cache.set(key, { expiresAt: now + ttlSeconds(fn) * 1000, payload: data });

    return NextResponse.json(
      { ok: true, cached: false, data },
      { headers: { "Cache-Control": `public, max-age=0, s-maxage=${ttlSeconds(fn)}` } }
    );
  } catch (err: any) {
    if (err?.name === "AbortError") return jsonError("Upstream request timed out.", 504);
    return jsonError("Failed to fetch from Alpha Vantage.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
