"use client";

import { useEffect, useMemo, useState } from "react";
import { STOCKS } from "@/lib/stocks";

function iconifySvgUrl(icon: string, size: number) {
  // Request a larger size than we render to keep logos crisp
  // (downscale in CSS)
  return `https://api.iconify.design/${encodeURIComponent(
    icon
  )}.svg?width=${size}&height=${size}`;
}

function clearbitUrl(domain: string, size: number) {
  // Clearbit logo endpoint (best-effort). We request 2x for crispness.
  const px = Math.max(32, Math.round(size * 2));
  return `https://logo.clearbit.com/${domain}?size=${px}`;
}

type Source =
  | { kind: "iconify"; icon: string }
  | { kind: "clearbit"; domain: string };

export default function StockLogo({
  symbol,
  size = 44,
  className = "",
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const stock = useMemo(
    () => STOCKS.find((s) => s.symbol === symbol),
    [symbol]
  );

  const sources = useMemo<Source[]>(() => {
    const list: Source[] = [];
    if (stock?.icon?.primary) list.push({ kind: "iconify", icon: stock.icon.primary });
    if (stock?.icon?.fallback) list.push({ kind: "iconify", icon: stock.icon.fallback });
    if (stock?.domain) list.push({ kind: "clearbit", domain: stock.domain });
    return list;
  }, [stock]);

  const [srcIndex, setSrcIndex] = useState(0);

  useEffect(() => {
    setSrcIndex(0);
  }, [symbol, sources.length]);

  const current = sources[srcIndex] ?? null;

  const src = useMemo(() => {
    if (!current) return null;
    if (current.kind === "iconify") return iconifySvgUrl(current.icon, Math.round(size * 2));
    if (current.kind === "clearbit") return clearbitUrl(current.domain, size);
    return null;
  }, [current, size]);

  const monogram = symbol.replace(/[^A-Z]/g, "").slice(0, 4);

  return (
    <div
      className={[
        "grid place-items-center rounded-2xl border bg-white shadow-sm overflow-hidden",
        className,
      ].join(" ")}
      style={{ width: size, height: size }}
      aria-label={`${symbol} logo`}
      title={stock?.name ?? symbol}
    >
      {src ? (
        <img
          src={src}
          alt={`${symbol} logo`}
          width={size}
          height={size}
          // downscale crisply; keep inside the pill
          className="h-full w-full object-contain p-1"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            // try next source; if none left => show monogram
            setSrcIndex((i) => i + 1);
          }}
        />
      ) : (
        <span className="text-[11px] font-semibold text-gray-700">{monogram}</span>
      )}
    </div>
  );
}
