import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

// We read local files (fixtures + disk cache) -> must run on Node.js runtime.
export const runtime = "nodejs";

type AvFunction = "OVERVIEW" | "TIME_SERIES_DAILY";
const ALLOWED_FUNCTIONS = new Set<AvFunction>(["OVERVIEW", "TIME_SERIES_DAILY"]);

// Strict ticker validation prevents path tricks/abuse (AAPL, BRK.B, RDS-A, etc.)
const SYMBOL_RE = /^[A-Z0-9.\-]{1,10}$/;

type CacheSource = "memory" | "disk" | "upstream" | "fixture" | "disk-stale";

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
  source: CacheSource;
};

// In-memory cache (per dev server / per instance)
const globalForCache = globalThis as unknown as { __avCache?: Map<string, CacheEntry> };
const memCache = globalForCache.__avCache ?? (globalForCache.__avCache = new Map());

// Serialize upstream calls + space them out (~1/sec) to reduce burst throttling
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
  const waitMs = Math.max(0, (limiter.__avLastCallAt ?? 0) + 1100 - now);
  if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
  limiter.__avLastCallAt = Date.now();

  try {
    return await fn();
  } finally {
    release();
  }
}

function ttlSeconds(fn: AvFunction) {
  // Overview changes infrequently; daily series changes more often.
  return fn === "OVERVIEW" ? 24 * 60 * 60 : 60 * 60;
}

function jsonError(message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ ok: false, error: message }, { status, headers });
}

function safeJsonParse(text: string): { ok: true; value: any } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

// -------------------- Disk cache (stale-if-error) --------------------
const DISK_DIR = path.join(process.cwd(), ".av-cache");

function diskFileName(fn: AvFunction, symbol: string) {
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
    const record: DiskCacheRecord = { savedAt: Date.now(), fn, symbol, payload };
    await fs.writeFile(p, JSON.stringify(record), "utf8");
  } catch {
    // best-effort
  }
}

// -------------------- Fixture fallback (committable) --------------------
async function readFixture(fn: AvFunction, symbol: string): Promise<unknown | null> {
  // fixtures/alpha-vantage/OVERVIEW__IBM.json
  const p = path.join(process.cwd(), "fixtures", "alpha-vantage", `${fn}__${symbol}.json`);
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    // allow either payload-only files OR disk-style wrapper (extra robust)
    if (parsed && typeof parsed === "object" && "payload" in parsed) {
      return (parsed as any).payload;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) return jsonError("Server misconfigured: missing ALPHAVANTAGE_API_KEY", 500);

  const { searchParams } = new URL(req.url);
  const fnRaw = searchParams.get("function")?.toUpperCase();
  const symbolRaw = searchParams.get("symbol")?.toUpperCase();

  const fn = (fnRaw ?? "") as AvFunction;
  const symbol = symbolRaw ?? "";

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
    memCache.set(key, { expiresAt: now + ttlMs, payload: diskRecord.payload, source: "disk" });
    return NextResponse.json(
      { ok: true, cached: true, source: "disk", data: diskRecord.payload },
      { headers: { "Cache-Control": `public, max-age=0, s-maxage=${ttlSeconds(fn)}` } }
    );
  }

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
    const parsed = safeJsonParse(text);

    if (!parsed.ok) {
      // non-JSON upstream: stale -> fixture -> error
      if (staleCandidate) {
        return NextResponse.json(
          {
            ok: true,
            cached: true,
            stale: true,
            source: "disk-stale",
            warning: "Upstream returned non-JSON; served cached data.",
            data: staleCandidate,
          },
          { headers: { "X-Data-Source": "disk-stale" } }
        );
      }

      const fixture = await readFixture(fn, symbol);
      if (fixture) {
        memCache.set(key, { expiresAt: now + ttlMs, payload: fixture, source: "fixture" });
        void writeDiskCache(fn, symbol, fixture);
        return NextResponse.json(
          {
            ok: true,
            cached: true,
            source: "fixture",
            warning: "Upstream returned non-JSON; served fixture data.",
            data: fixture,
          },
          { headers: { "X-Data-Source": "fixture" } }
        );
      }

      return jsonError("Upstream returned non-JSON response.", 502);
    }

    const data: any = parsed.value;

    // Alpha Vantage throttle/quota often comes as Note or Information
    const throttleMsg = data?.Note ?? data?.Information;
    if (throttleMsg) {
      if (staleCandidate) {
        return NextResponse.json(
          {
            ok: true,
            cached: true,
            stale: true,
            source: "disk-stale",
            warning: String(throttleMsg),
            data: staleCandidate,
          },
          { headers: { "X-Data-Source": "disk-stale", "Retry-After": "1" } }
        );
      }

      const fixture = await readFixture(fn, symbol);
      if (fixture) {
        memCache.set(key, { expiresAt: now + ttlMs, payload: fixture, source: "fixture" });
        void writeDiskCache(fn, symbol, fixture);
        return NextResponse.json(
          {
            ok: true,
            cached: true,
            source: "fixture",
            warning: String(throttleMsg),
            data: fixture,
          },
          { headers: { "X-Data-Source": "fixture", "Retry-After": "1" } }
        );
      }

      // No fallback -> 429 (your UI handles this)
      return NextResponse.json(
        { ok: false, error: String(throttleMsg) },
        { status: 429, headers: { "Retry-After": "1" } }
      );
    }

    if (data?.["Error Message"]) {
      const msg = `Alpha Vantage error: ${data["Error Message"]}`;

      if (staleCandidate) {
        return NextResponse.json(
          { ok: true, cached: true, stale: true, source: "disk-stale", warning: msg, data: staleCandidate },
          { headers: { "X-Data-Source": "disk-stale" } }
        );
      }

      const fixture = await readFixture(fn, symbol);
      if (fixture) {
        memCache.set(key, { expiresAt: now + ttlMs, payload: fixture, source: "fixture" });
        void writeDiskCache(fn, symbol, fixture);
        return NextResponse.json(
          { ok: true, cached: true, source: "fixture", warning: msg, data: fixture },
          { headers: { "X-Data-Source": "fixture" } }
        );
      }

      return jsonError(msg, 502);
    }

    if (!res.ok) {
      const msg = `Upstream HTTP ${res.status}`;

      if (staleCandidate) {
        return NextResponse.json(
          { ok: true, cached: true, stale: true, source: "disk-stale", warning: msg, data: staleCandidate },
          { headers: { "X-Data-Source": "disk-stale" } }
        );
      }

      const fixture = await readFixture(fn, symbol);
      if (fixture) {
        memCache.set(key, { expiresAt: now + ttlMs, payload: fixture, source: "fixture" });
        void writeDiskCache(fn, symbol, fixture);
        return NextResponse.json(
          { ok: true, cached: true, source: "fixture", warning: msg, data: fixture },
          { headers: { "X-Data-Source": "fixture" } }
        );
      }

      return jsonError(msg, 502);
    }

    // Success: cache in memory + disk
    memCache.set(key, { expiresAt: now + ttlMs, payload: data, source: "upstream" });
    await writeDiskCache(fn, symbol, data);

    return NextResponse.json(
      { ok: true, cached: false, source: "upstream", data },
      { headers: { "Cache-Control": `public, max-age=0, s-maxage=${ttlSeconds(fn)}` } }
    );
  } catch (err: any) {
    // Network/timeouts: stale -> fixture -> error
    if (staleCandidate) {
      return NextResponse.json(
        {
          ok: true,
          cached: true,
          stale: true,
          source: "disk-stale",
          warning: err?.name === "AbortError" ? "Upstream timed out." : "Upstream fetch failed.",
          data: staleCandidate,
        },
        { headers: { "X-Data-Source": "disk-stale" } }
      );
    }

    const fixture = await readFixture(fn, symbol);
    if (fixture) {
      memCache.set(key, { expiresAt: now + ttlMs, payload: fixture, source: "fixture" });
      void writeDiskCache(fn, symbol, fixture);
      return NextResponse.json(
        {
          ok: true,
          cached: true,
          source: "fixture",
          warning: err?.name === "AbortError" ? "Upstream timed out; served fixture data." : "Upstream failed; served fixture data.",
          data: fixture,
        },
        { headers: { "X-Data-Source": "fixture" } }
      );
    }

    if (err?.name === "AbortError") return jsonError("Upstream request timed out.", 504);
    return jsonError("Failed to fetch from Alpha Vantage.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
