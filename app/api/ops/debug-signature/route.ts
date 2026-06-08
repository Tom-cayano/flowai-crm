import { NextRequest, NextResponse } from "next/server";
import { createHmac, createHash } from "crypto";

// GET — returns SHA256 of the runtime secret without needing a real webhook body.
// Use this to verify which exact secret the runtime loaded.
// Compare the returned secretSha256 with:
//   node -e "const c=require('crypto');console.log(c.createHash('sha256').update('YOUR_SECRET').digest('hex'))"
export async function GET(_req: NextRequest) {
  const envIGSecret   = process.env.INSTAGRAM_APP_SECRET ?? "";
  const envMetaSecret = process.env.META_APP_SECRET ?? "";

  const usedVar    = envIGSecret ? "INSTAGRAM_APP_SECRET" : envMetaSecret ? "META_APP_SECRET" : "NONE";
  const rawSecret  = envIGSecret || envMetaSecret || "";
  const appSecret  = rawSecret.trim();

  return NextResponse.json({
    forensic: {
      usedVar,
      secretLength:        appSecret.length,
      rawLength:           rawSecret.length,
      hadTrailingWhitespace: rawSecret.length !== appSecret.length,
      secretPrefix:        appSecret.slice(0, 4),
      secretSha256:        appSecret ? createHash("sha256").update(appSecret).digest("hex") : null,
      isPlaceholder:       appSecret === "REEMPLAZA_CON_TU_META_APP_SECRET",
      igSecretPresent:     !!envIGSecret,
      metaSecretPresent:   !!envMetaSecret,
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
      expectedPrefix:        expected.slice(0, 20),
      receivedPrefix:        signature.slice(0, 20),
      match:                 !!expected && expected === signature,
      isPlaceholder:         appSecret === "REEMPLAZA_CON_TU_META_APP_SECRET",
    }
  });
}
