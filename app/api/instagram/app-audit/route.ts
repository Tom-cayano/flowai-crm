// Diagnóstico read-only de la configuración de la App de Meta (ejecutado en
// Vercel, donde el App Secret SÍ está en el entorno). Audita: info/modo de la
// app, roles (admins/devs/testers), Instagram testers, suscripciones de webhook
// (a nivel de app y de página) y los scopes del token de cada cuenta.
//
// Seguridad: exige x-sales-secret == EVOLUTION_WEBHOOK_SECRET. Solo lecturas.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken } from "@/lib/instagram/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const V = "https://graph.facebook.com/v21.0";

async function g(url: string): Promise<{ status: number; json: unknown }> {
  const r = await fetch(url);
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

export async function GET(req: NextRequest) {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
  if (secret && req.headers.get("x-sales-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId  = (process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID || "").trim();
  const secretV = (process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || "").trim();
  if (!appId || !secretV) {
    return NextResponse.json({ error: "META_APP_ID/SECRET no disponibles en el entorno", appId: appId || null }, { status: 200 });
  }
  const appToken = `${appId}|${secretV}`;

  const out: Record<string, unknown> = { appId };
  out.app          = (await g(`${V}/${appId}?fields=name,app_type,link,restrictions,privacy_policy_url,category&access_token=${appToken}`)).json;
  out.roles        = (await g(`${V}/${appId}/roles?access_token=${appToken}`)).json;
  out.igTesters    = (await g(`${V}/${appId}/instagram_testers?fields=username,id&access_token=${appToken}`)).json;
  out.subscriptions = (await g(`${V}/${appId}/subscriptions?access_token=${appToken}`)).json;

  // Por página: suscripción de webhook + scopes del token
  const db = createAdminClient();
  const { data: accounts } = await db
    .from("instagram_accounts")
    .select("id, ig_user_id, page_id, connection_state")
    .eq("is_active", true);

  const perAccount: unknown[] = [];
  for (const a of accounts ?? []) {
    const tok = await getAccessToken(a.id);
    const entry: Record<string, unknown> = {
      accountId: a.id, igUserId: a.ig_user_id, pageId: a.page_id, state: a.connection_state,
      hasToken: Boolean(tok),
    };
    if (tok && a.page_id) {
      entry.subscribedApps = (await g(`${V}/${a.page_id}/subscribed_apps?access_token=${tok}`)).json;
      entry.tokenDebug     = (await g(`${V}/debug_token?input_token=${tok}&access_token=${tok}`)).json;
      entry.igLink         = (await g(`${V}/${a.page_id}?fields=instagram_business_account,name&access_token=${tok}`)).json;
    }
    perAccount.push(entry);
  }
  out.accounts = perAccount;

  return NextResponse.json(out);
}
