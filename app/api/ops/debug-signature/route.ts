import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

export async function POST(req: NextRequest) {
  const rawBody = await req.arrayBuffer();
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  const envSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || "";
  const appSecret = envSecret.trim();

  const expected = `sha256=${createHmac("sha256", appSecret)
    .update(Buffer.from(rawBody))
    .digest("hex")}`;

  return NextResponse.json({
    debug: {
      hasSignature: !!signature,
      signaturePrefix: signature.slice(0, 20),
      hasSecret: !!appSecret,
      secretLength: appSecret.length,
      envSecretLength: envSecret.length,
      bodyLength: rawBody.byteLength,
      expectedPrefix: expected.slice(0, 20),
      receivedPrefix: signature.slice(0, 20),
      isPlaceholder: appSecret === "REEMPLAZA_CON_TU_META_APP_SECRET"
    }
  });
}
