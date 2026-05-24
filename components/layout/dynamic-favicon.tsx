"use client";

import { useEffect } from "react";

interface DynamicFaviconProps {
  logoUrl: string | null;
}

// Swaps the page favicon to the workspace logo when one is available.
// Falls back silently — the default Next.js icon.svg stays in place.
export function DynamicFavicon({ logoUrl }: DynamicFaviconProps) {
  useEffect(() => {
    if (!logoUrl) return;

    // Only allow http/https URLs to prevent javascript: or data: injection.
    let parsed: URL;
    try {
      parsed = new URL(logoUrl);
    } catch {
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;

    const existing = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    const link: HTMLLinkElement = existing ?? document.createElement("link");
    link.rel = "icon";
    link.href = logoUrl;
    if (!existing) document.head.appendChild(link);

    return () => {
      // Restore to the default app icon on unmount (e.g., navigating away from
      // a white-labeled workspace into a non-branded context).
      link.href = "/icon.svg";
    };
  }, [logoUrl]);

  return null;
}
