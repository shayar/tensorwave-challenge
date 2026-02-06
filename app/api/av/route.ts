import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

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

// -------------------- In-memory cache (fallback, per instance) --------------------
const globalForCache = globalThis as unknown as { __avCache?: Map<string, CacheEntry> };
const memCache = globalForCache.__avCache ?? (globalForCache.__avCache = new Map());

// -------------------- Serialize upstream calls (avoid burst) --------------------
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
  // Used only for "freshness" decisions when writing cache and serving mem hits as fallback.
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
    // allow either payload-only OR disk-style wrapper
    if (parsed && typeof parsed === "object" && "payload" in parsed) return (parsed as any).payload;
    return parsed;
  } catch {
    return null;
  }
}

// -------------------- Helper: choose best fallback --------------------
async function fallbackResponse(params: {
  fn: AvFunction;
  symbol: string;
  key: string;
  ttlMs: number;
  now: number;
  warning: string;
  retryAfter?: string;
}) {
  const { fn, symbol, key, ttlMs, now, warning, retryAfter } = params;

  // 1) prefer disk cache (stale allowed)
  const diskRecord = await readDiskCache(fn, symbol);
  if (diskRecord?.payload) {
    memCache.set(key, { expiresAt: now + ttlMs, payload: diskRecord.payload, source: "disk" });
    return NextResponse.json(
      {
        ok: true,
        cached: true,
        stale: true,
        source: "disk-stale",
        warning,
        data: diskRecord.payload,
      },
      {
        headers: {
          "X-Data-Source": "disk-stale",
          ...(retryAfter ? { "Retry-After": retryAfter } : {}),
        },
      }
    );
  }

  // 2) then fixture
  const fixture = await readFixture(fn, symbol);
  if (fixture) {
    memCache.set(key, { expiresAt: now + ttlMs, payload: fixture, source: "fixture" });
    void writeDiskCache(fn, symbol, fixture);
    return NextResponse.json(
      {
        ok: true,
        cached: true,
        source: "fixture",
        warning,
        data: fixture,
      },
      {
        headers: {
          "X-Data-Source": "fixture",
          ...(retryAfter ? { "Retry-After": retryAfter } : {}),
        },
      }
    );
  }

  // 3) lastly: mem cache (only if present and not wildly old)
  const memHit = memCache.get(key);
  if (memHit?.payload) {
    return NextResponse.json(
      { ok: true, cached: true, stale: true, source: "memory", warning, data: memHit.payload },
      { headers: { "X-Data-Source": "memory" } }
    );
  }

  // nothing to fall back to
  return null;
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

  // -------------------- NETWORK-FIRST --------------------
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

    // 1) non-JSON => fallback
    if (!parsed.ok) {
      const fb = await fallbackResponse({
        fn,
        symbol,
        key,
        ttlMs,
        now,
        warning: "Upstream returned non-JSON; served fallback data.",
      });
      if (fb) return fb;
      return jsonError("Upstream returned non-JSON response and no fallback is available.", 502);
    }

    const data: any = parsed.value;

    // 2) throttle/quota => fallback (rate limit friendly behavior)
    const throttleMsg = data?.Note ?? data?.Information;
    if (throttleMsg) {
      const fb = await fallbackResponse({
        fn,
        symbol,
        key,
        ttlMs,
        now,
        warning: String(throttleMsg),
        retryAfter: "1",
      });
      if (fb) return fb;

      return NextResponse.json(
        { ok: false, error: String(throttleMsg) },
        { status: 429, headers: { "Retry-After": "1" } }
      );
    }

    // 3) AV error => fallback
    if (data?.["Error Message"]) {
      const fb = await fallbackResponse({
        fn,
        symbol,
        key,
        ttlMs,
        now,
        warning: `Alpha Vantage error: ${data["Error Message"]}`,
      });
      if (fb) return fb;
      return jsonError(`Alpha Vantage error: ${data["Error Message"]}`, 502);
    }

    // 4) HTTP not ok => fallback
    if (!res.ok) {
      const fb = await fallbackResponse({
        fn,
        symbol,
        key,
        ttlMs,
        now,
        warning: `Upstream HTTP ${res.status}`,
      });
      if (fb) return fb;
      return jsonError(`Upstream HTTP ${res.status}`, 502);
    }

    // ✅ Success: write through cache (for future fallbacks)
    memCache.set(key, { expiresAt: now + ttlMs, payload: data, source: "upstream" });
    await writeDiskCache(fn, symbol, data);

    return NextResponse.json(
      { ok: true, cached: false, source: "upstream", data },
      {
        headers: {
          "Cache-Control": `public, max-age=0, s-maxage=${ttlSeconds(fn)}`,
          "X-Data-Source": "upstream",
        },
      }
    );
  } catch (err: any) {
    const fb = await fallbackResponse({
      fn,
      symbol,
      key,
      ttlMs,
      now,
      warning: err?.name === "AbortError" ? "Upstream timed out." : "Upstream fetch failed.",
    });
    if (fb) return fb;

    if (err?.name === "AbortError") return jsonError("Upstream request timed out.", 504);
    return jsonError("Failed to fetch from Alpha Vantage and no fallback is available.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
