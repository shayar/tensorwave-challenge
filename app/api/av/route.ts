// app/api/av/route.ts
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

// We use fs -> must run on Node.js runtime (Edge doesn't support fs).
export const runtime = "nodejs";

type AvFunction = "OVERVIEW" | "TIME_SERIES_DAILY";
const ALLOWED_FUNCTIONS = new Set<AvFunction>(["OVERVIEW", "TIME_SERIES_DAILY"]);

// Allows common tickers like AAPL, MSFT, BRK.B, RDS-A (strict to prevent abuse)
const SYMBOL_RE = /^[A-Z0-9.\-]{1,10}$/;

type CacheEntry = { expiresAt: number; payload: unknown };

// In-memory cache (per dev server / per instance)
const globalForCache = globalThis as unknown as { __avCache?: Map<string, CacheEntry> };
const memCache = globalForCache.__avCache ?? (globalForCache.__avCache = new Map());

// Simple in-memory global limiter to avoid per-second burst throttling
const limiter = globalThis as unknown as {
  __avQueue?: Promise<void>;
  __avLastCallAt?: number;
};
limiter.__avQueue ??= Promise.resolve();
limiter.__avLastCallAt ??= 0;

async function scheduleAlphaVantageCall<T>(fn: () => Promise<T>): Promise<T> {
  const prev = limiter.__avQueue!;
  let release!: () => void;
  limiter.__avQueue = new Promise<void>((r) => (release = r));

  await prev;

  const now = Date.now();
  const waitMs = Math.max(0, limiter.__avLastCallAt! + 1100 - now);
  if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
  limiter.__avLastCallAt = Date.now();

  try {
    return await fn();
  } finally {
    release();
  }
}

function ttlSeconds(fn: AvFunction) {
  // Overview changes infrequently; daily series changes ~daily.
  return fn === "OVERVIEW" ? 24 * 60 * 60 : 60 * 60;
}

function jsonError(message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ ok: false, error: message }, { status, headers });
}

// ---------- Disk cache helpers (stale-if-error resilience) ----------
const DISK_DIR = path.join(process.cwd(), ".av-cache");

function diskFileName(fn: AvFunction, symbol: string) {
  // safe filename
  return `${fn}__${symbol}.json`;
}

type DiskCacheRecord = {
  savedAt: number;
  fn: AvFunction;
  symbol: string;
  payload: unknown;
};

async function readDiskCache(fn: AvFunction, symbol: string): Promise<DiskCacheRecord | null> {
  try {
    const p = path.join(DISK_DIR, diskFileName(fn, symbol));
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as DiskCacheRecord;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeDiskCache(fn: AvFunction, symbol: string, payload: unknown) {
  try {
    await fs.mkdir(DISK_DIR, { recursive: true });
    const p = path.join(DISK_DIR, diskFileName(fn, symbol));
    const record: DiskCacheRecord = {
      savedAt: Date.now(),
      fn,
      symbol,
      payload,
    };
    await fs.writeFile(p, JSON.stringify(record), "utf8");
  } catch {
    // best-effort; never fail the request because disk cache couldn't write
  }
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
  const ttlMs = ttlSeconds(fn) * 1000;

  // 1) Memory cache hit
  const memHit = memCache.get(key);
  if (memHit && memHit.expiresAt > now) {
    // Persist on-hit too (helps preserve data even when AV later blocks you)
    void writeDiskCache(fn, symbol, memHit.payload);

    return NextResponse.json(
      { ok: true, cached: true, source: "memory", data: memHit.payload },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } }
    );
  }

  // 2) Disk cache hit (fresh or stale candidate)
  const diskRecord = await readDiskCache(fn, symbol);
  const diskAgeMs = diskRecord ? now - diskRecord.savedAt : Infinity;
  const diskFresh = diskRecord ? diskAgeMs <= ttlMs : false;

  if (diskRecord && diskFresh) {
    // Re-hydrate memory cache too
    memCache.set(key, { expiresAt: now + ttlMs, payload: diskRecord.payload });

    return NextResponse.json(
      { ok: true, cached: true, source: "disk", data: diskRecord.payload },
      { headers: { "Cache-Control": `public, max-age=0, s-maxage=${ttlSeconds(fn)}` } }
    );
  }

  // If disk exists but is stale, keep it as a fallback if upstream fails
  const staleCandidate = diskRecord?.payload ?? null;

  // 3) Upstream call
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", fn);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  if (fn === "TIME_SERIES_DAILY") url.searchParams.set("outputsize", "compact");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await scheduleAlphaVantageCall(() =>
      fetch(url.toString(), { signal: controller.signal })
    );

    const text = await res.text();

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // If upstream is broken but we have stale cache, serve it
      if (staleCandidate) {
        return NextResponse.json(
          {
            ok: true,
            cached: true,
            stale: true,
            source: "disk",
            warning: "Upstream returned non-JSON; served cached data.",
            data: staleCandidate,
          },
          { headers: { "X-Data-Source": "disk-stale" } }
        );
      }
      return jsonError("Upstream returned non-JSON response.", 502);
    }

    // Alpha Vantage throttle messages often come as Note or Information
    const throttleMsg = data?.Note ?? data?.Information;
    if (throttleMsg) {
      // If we have stale data, serve it (stale-if-error)
      if (staleCandidate) {
        return NextResponse.json(
          {
            ok: true,
            cached: true,
            stale: true,
            source: "disk",
            warning: String(throttleMsg),
            data: staleCandidate,
          },
          {
            headers: {
              "X-Data-Source": "disk-stale",
              // still hint that client should back off
              "Retry-After": "1",
            },
          }
        );
      }

      // Otherwise return 429 (your UI already handles this nicely)
      return NextResponse.json(
        { ok: false, error: String(throttleMsg) },
        { status: 429, headers: { "Retry-After": "1" } }
      );
    }

    if (data?.["Error Message"]) {
      if (staleCandidate) {
        return NextResponse.json(
          {
            ok: true,
            cached: true,
            stale: true,
            source: "disk",
            warning: `Alpha Vantage error: ${data["Error Message"]}`,
            data: staleCandidate,
          },
          { headers: { "X-Data-Source": "disk-stale" } }
        );
      }
      return jsonError(`Alpha Vantage error: ${data["Error Message"]}`, 502);
    }

    if (!res.ok) {
      if (staleCandidate) {
        return NextResponse.json(
          {
            ok: true,
            cached: true,
            stale: true,
            source: "disk",
            warning: `Upstream HTTP ${res.status}; served cached data.`,
            data: staleCandidate,
          },
          { headers: { "X-Data-Source": "disk-stale" } }
        );
      }
      return jsonError(`Upstream HTTP ${res.status}`, 502);
    }

    // Success: cache in memory + disk
    memCache.set(key, { expiresAt: now + ttlMs, payload: data });
    await writeDiskCache(fn, symbol, data);

    return NextResponse.json(
      { ok: true, cached: false, source: "upstream", data },
      { headers: { "Cache-Control": `public, max-age=0, s-maxage=${ttlSeconds(fn)}` } }
    );
  } catch (err: any) {
    if (staleCandidate) {
      return NextResponse.json(
        {
          ok: true,
          cached: true,
          stale: true,
          source: "disk",
          warning: err?.name === "AbortError" ? "Upstream timed out." : "Upstream fetch failed.",
          data: staleCandidate,
        },
        { headers: { "X-Data-Source": "disk-stale" } }
      );
    }

    if (err?.name === "AbortError") return jsonError("Upstream request timed out.", 504);
    return jsonError("Failed to fetch from Alpha Vantage.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
