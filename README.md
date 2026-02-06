# Tensor Wave Stock Info Challenge

A clean, responsive stock watchlist UI built with **Next.js (App Router)** and the **Alpha Vantage** API.  
Browse a curated list of tickers, open a detail page for each company, and explore the latest daily price history with an interactive 30‑day trend chart.

This project also includes a **resilient API proxy** that helps you survive Alpha Vantage throttling by using **in‑memory caching**, **disk caching**, and **fixture fallbacks**—with **data source transparency** surfaced in the UI.

---

## Features

### UI
- **Homepage watchlist** with modern “market” styling and responsive cards
- **Stock detail page** with:
  - Company overview panel (scrollable)
  - Daily price history panel (scrollable) with:
    - Interactive **30D trend line chart**
    - Summary stat cards
    - Zebra‑striped price table
- **Loading UX** with skeleton shimmer + spinner
- **Rate limit UX** with retry countdown button

### Data / Resilience
- **Server-side API proxy** (`/api/av`) to call Alpha Vantage safely
- **Serialized upstream calls** (~1 request/sec) to reduce burst throttling
- **Multi-layer caching**
  - **Memory** cache (fast, per server instance)
  - **Disk** cache (`.av-cache/`) for persistence across reloads
- **Fallback strategy**
  - Use cache/fixtures only when Alpha Vantage **errors**, **returns non‑JSON**, or **throttles**
- **Data source transparency**
  - UI badges show whether content is **Live**, **Cached**, **Fixture**, or **Stale fallback**

---

## Tech Stack

- **Next.js** (App Router) + TypeScript
- Tailwind CSS
- Alpha Vantage API functions:
  - `OVERVIEW`
  - `TIME_SERIES_DAILY`
- SVG logos via Iconify (with graceful fallbacks)

---

## Project Structure (high level)

```bash
app/
  page.tsx                         # Watchlist homepage
  stock/[symbol]/page.tsx           # Stock details route
  stock/[symbol]/StockDetailsClient.tsx
  api/av/route.ts                   # Alpha Vantage proxy + cache + fallback

components/
  StockLogo.tsx                     # Iconify SVG logo loader + fallback

lib/
  stocks.ts                         # Ticker list + logo ids + optional domains

fixtures/
  alpha-vantage/                    # Optional committable sample responses for fallback
.av-cache/                          # Runtime disk cache (generated)
```

> Note: `.av-cache/` is created at runtime (best to ignore it in git).

---

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Add environment variables

Create a file named **`.env.local`** in the project root:

```bash
ALPHAVANTAGE_API_KEY=YOUR_KEY_HERE
```

Get a key from Alpha Vantage and paste it in.

### 3) Run the dev server

```bash
npm run dev
```

Open:

```bash
http://localhost:3000
```

---

## How the API Proxy Works

All client calls go through:

- `GET /api/av?function=OVERVIEW&symbol=AAPL`
- `GET /api/av?function=TIME_SERIES_DAILY&symbol=AAPL`

The proxy:
1. **Validates** function + symbol
2. Checks **memory cache**
3. Checks **disk cache**
4. Calls Alpha Vantage (serialized to ~1 request/sec)
5. If Alpha Vantage **throttles** or **errors**, it falls back to:
   - **stale disk cache** (if available), else
   - **fixtures** (if available), else
   - returns a clean error (UI shows retry UX)

### Data Source Transparency (UI badges)

The API responds with metadata like:

- `source: "upstream" | "memory" | "disk" | "fixture" | "disk-stale"`
- `cached: boolean`
- `stale: boolean`
- `warning?: string`

The UI displays this at the top of each panel so reviewers can see when data is live vs cached/fallback.

---

## Fixtures (Optional)

You may include sample Alpha Vantage responses in:

```bash
fixtures/alpha-vantage/
  OVERVIEW__AAPL.json
  TIME_SERIES_DAILY__AAPL.json
  ...
```

These are **only used as fallback** if:
- Alpha Vantage throttles/limits your requests
- Alpha Vantage returns invalid/non‑JSON responses
- Upstream request fails (timeout/network)

Fixtures can be either:
- a raw Alpha Vantage JSON payload, or
- a wrapper with `{ "payload": <json> }`

---

## Notes / Tradeoffs

- Alpha Vantage has strict rate limits on free tiers. The proxy includes:
  - request serialization
  - caching
  - fallbacks
- Logos are loaded via Iconify SVG endpoints; some icons may not exist for certain tickers, so `StockLogo` gracefully falls back to a monogram.
- Disk caching is designed for local/dev convenience and simple deployments.

---

## Scripts

```bash
npm run dev        # start dev server
npm run build      # production build
npm run start      # run production server
npm run lint       # lint
```

---

## Reviewer Checklist

To verify core requirements quickly:
1. Open homepage → click multiple tickers
2. Confirm details page shows:
   - Overview panel scroll
   - Price panel scroll
   - Chart + stats + zebra table
3. Open DevTools → throttle network / spam refresh
4. Confirm:
   - rate limit banner appears
   - “Retry” UX works
   - data source badges switch to Cached / Stale / Fixture appropriately

---

## Author

**Shayar Shrestha**  
Built with Next.js and Alpha Vantage as part of the Tensor Wave Stock Info Challenge.
