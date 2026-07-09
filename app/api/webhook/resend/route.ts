// Webhook oficial de Resend — estados de entrega del canal email.
//
// Eventos → email_logs:
//   email.sent / email.delivered / email.delivery_delayed / email.bounced /
//   email.complained / email.opened / email.clicked
//
// Multi-tenant: el email se correlaciona por resend_email_id (único global),
// y la firma svix se verifica con el webhook_secret del DUEÑO de ese email.
// Ruta bajo /api/webhook/ → exenta del middleware de sesión.

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResendEvent {
  type: string;
  created_at: string;
  data: { email_id?: string; [k: string]: unknown };
}

/** Verificación de firma svix (svix-id.svix-timestamp.payload, HMAC-SHA256). */
function verifySvix(req: NextRequest, payload: string, secret: string): boolean {
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sig = req.headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  // Tolerancia de 5 min contra replay
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", secretBytes)
    .update(`${id}.${ts}.${payload}`)
    .digest("base64");

  // Cabecera formato: "v1,<base64> v1,<base64>…"
  return sig.split(" ").some((part) => {
    const candidate = part.split(",")[1] ?? "";
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function POST(request: NextRequest) {
  const payload = await request.text();

  let event: ResendEvent;
  try {
    event = JSON.parse(payload) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailId = event.data?.email_id;
  if (!emailId) return NextResponse.json({ received: true });

  const db = createAdminClient();
  const { data: log } = await db
    .from("email_logs")
    .select("id, user_id")
    .eq("resend_email_id", emailId)
    .maybeSingle();

  if (!log) return NextResponse.json({ received: true }); // email de otro sistema

  // Verificar firma con el secreto del dueño del email (si lo configuró)
  const { data: settings } = await db
    .from("email_settings")
    .select("webhook_secret")
    .eq("user_id", log.user_id)
    .maybeSingle();

  if (settings?.webhook_secret) {
    if (!verifySvix(request, payload, settings.webhook_secret)) {
      console.warn("[webhook/resend] Firma svix inválida", { emailId });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("[webhook/resend] Sin webhook_secret configurado — evento aceptado sin verificar");
  }

  const now = new Date().toISOString();
  const patch: {
    status?: "sent" | "delivered" | "delayed" | "bounced" | "complained";
    delivered_at?: string; bounced_at?: string; opened_at?: string; clicked_at?: string;
  } = {};

  switch (event.type) {
    case "email.sent":             patch.status = "sent"; break;
    case "email.delivered":        patch.status = "delivered"; patch.delivered_at = now; break;
    case "email.delivery_delayed": patch.status = "delayed"; break;
    case "email.bounced":          patch.status = "bounced"; patch.bounced_at = now; break;
    case "email.complained":       patch.status = "complained"; break;
    case "email.opened":           patch.opened_at = now; break;
    case "email.clicked":          patch.clicked_at = now; break;
    default:
      return NextResponse.json({ received: true });
  }

  await db.from("email_logs").update(patch).eq("id", log.id);
  return NextResponse.json({ received: true });
}
