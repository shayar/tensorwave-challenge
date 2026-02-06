"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

export default function StockLogo({
  name,
  domain,
  size = 36,
}: {
  name: string;
  domain: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  const src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    domain
  )}&sz=${size * 2}`; // :contentReference[oaicite:5]{index=5}

  if (failed) {
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

    return (
      <div
        className="grid place-items-center rounded-xl border bg-white text-sm font-semibold text-gray-700 shadow-sm"
        style={{ width: size, height: size }}
        title={name}
        aria-label={`${name} logo`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      width={size}
      height={size}
      className="rounded-xl border bg-white shadow-sm"
      alt={`${name} logo`}
      title={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
