import { NextRequest, NextResponse } from "next/server";
import { createHmac, createHash } from "crypto";
import { getProducerRedis } from "@/lib/redis/client";

// GET — returns:
//   forensic.activeSecret  — SHA256 of the runtime secret
//   forensic.lastMismatch  — full signatureFull + expectedFull from the last failing Meta event
export async function GET(_req: NextRequest) {
  const envIGSecret   = process.env.INSTAGRAM_APP_SECRET ?? "";
  const envMetaSecret = process.env.META_APP_SECRET ?? "";

  const igTrimmed   = envIGSecret.trim();
  const metaTrimmed = envMetaSecret.trim();
  const usedVar     = igTrimmed ? "INSTAGRAM_APP_SECRET" : metaTrimmed ? "META_APP_SECRET" : "NONE";
  const appSecret   = igTrimmed || metaTrimmed;

  // Retrieve last captured mismatch from Redis (written by webhook route on failure)
  let lastMismatch: unknown = null;
  try {
    const raw = await getProducerRedis().get("forensic:ig:last-mismatch");
    if (raw) lastMismatch = JSON.parse(raw);
  } catch { /* Redis unavailable */ }

  return NextResponse.json({
    forensic: {
      usedVar,
      activeSecret: {
        length:  appSecret.length,
        prefix:  appSecret.slice(0, 4),
        sha256:  appSecret ? createHash("sha256").update(appSecret).digest("hex") : null,
      },
      INSTAGRAM_APP_SECRET: envIGSecret ? {
        length:  igTrimmed.length,
        prefix:  igTrimmed.slice(0, 4),
        sha256:  createHash("sha256").update(igTrimmed).digest("hex"),
      } : null,
      META_APP_SECRET: envMetaSecret ? {
        length:  metaTrimmed.length,
        prefix:  metaTrimmed.slice(0, 4),
        sha256:  createHash("sha256").update(metaTrimmed).digest("hex"),
      } : null,
      secretsAreIdentical: !!igTrimmed && !!metaTrimmed && igTrimmed === metaTrimmed,
      // Last failing event — populated after the next real Meta webhook fails
      lastMismatch,
    }
  });
}

export async function POST(req: NextRequest) {
  const rawBody   = await req.arrayBuffer();
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  const envIGSecret   = process.env.INSTAGRAM_APP_SECRET ?? "";
  const envMetaSecret = process.env.META_APP_SECRET ?? "";
  const usedVar       = envIGSecret ? "INSTAGRAM_APP_SECRET" : envMetaSecret ? "META_APP_SECRET" : "NONE";
  const rawSecret     = envIGSecret || envMetaSecret || "";
  const appSecret     = rawSecret.trim();
  const bodyBuf       = Buffer.from(rawBody);

  const expected = appSecret
    ? `sha256=${createHmac("sha256", appSecret).update(bodyBuf).digest("hex")}`
    : "";

  return NextResponse.json({
    debug: {
      usedVar,
      hasSignature:          !!signature,
      signaturePrefix:       signature.slice(0, 20),
      hasSecret:             !!appSecret,
      secretLength:          appSecret.length,
      rawLength:             rawSecret.length,
      hadTrailingWhitespace: rawSecret.length !== appSecret.length,
      secretSha256:          appSecret ? createHash("sha256").update(appSecret).digest("hex") : null,
      bodyLength:            rawBody.byteLength,
      expectedFull:          expected,
      receivedFull:          signature,
      match:                 !!expected && expected === signature,
      isPlaceholder:         appSecret === "REEMPLAZA_CON_TU_META_APP_SECRET",
    }
  });
}
