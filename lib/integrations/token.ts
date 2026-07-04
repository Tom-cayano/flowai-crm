// Bearer token generation for webhook integrations.
// Tokens are opaque, high-entropy values with a recognizable prefix so they
// can be identified in logs and secret scanners (like Stripe's sk_live_...).

import { randomBytes } from "node:crypto";

const TOKEN_PREFIX = "fw_";

/** Generates a new integration bearer token: fw_<64 hex chars> (256 bits). */
export function generateIntegrationToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;
}

/** Cheap shape check before hitting the database. */
export function looksLikeIntegrationToken(token: string): boolean {
  return /^fw_[0-9a-f]{64}$/.test(token);
}

/** Normalizes an application name to a matching slug: "Fit Coach" → "fit-coach". */
export function toSourceKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "app";
}
